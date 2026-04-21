"""
OCR module for image preprocessing and text extraction using Tesseract.
"""

import logging
from typing import Tuple

import cv2
import numpy as np
import pytesseract
from PIL import Image

from .utils import load_image

logger = logging.getLogger(__name__)


def preprocess_image(image: np.ndarray) -> np.ndarray:
    """
    Preprocess image for better OCR accuracy.
    
    Pipeline:
    1. Convert to grayscale if needed
    2. Apply Gaussian blur to reduce noise
    3. Apply Otsu's thresholding for binarization
    4. Resize if image is too small
    
    Args:
        image: Input image as numpy array
        
    Returns:
        Preprocessed binary image
    """
    try:
        # Step 1: Convert to grayscale if color image
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        logger.debug("Converted image to grayscale")
        
        # Step 2: Resize if image is too small (less than 300px width)
        min_width = 300
        if gray.shape[1] < min_width:
            scale = min_width / gray.shape[1]
            new_width = int(gray.shape[1] * scale)
            new_height = int(gray.shape[0] * scale)
            gray = cv2.resize(gray, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
            logger.debug(f"Resized image from original to {new_width}x{new_height}")
        
        # Step 3: Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        logger.debug("Applied Gaussian blur (5x5)")
        
        # Step 4: Apply adaptive thresholding instead of Otsu's
        # Adaptive thresholding is better for capturing light text on various backgrounds
        # This handles lighter colored usernames better
        adaptive = cv2.adaptiveThreshold(
            blurred,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=31,  # Larger block size for better light text detection
            C=2  # Small constant to help capture lighter text
        )
        logger.debug("Applied adaptive thresholding")
        
        binary = adaptive
        
        # Step 5: Optional morphological cleanup
        # Remove small noise with erosion followed by dilation
        kernel = np.ones((2, 2), np.uint8)
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        logger.debug("Applied morphological closing")
        
        logger.info("Image preprocessing completed")
        return binary
        
    except Exception as e:
        logger.error(f"Error during image preprocessing: {e}")
        # Return original grayscale if preprocessing fails
        if len(image.shape) == 3:
            return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return image


def extract_text(image_path: str, config: str = "--psm 6") -> str:
    """
    Extract text from image using Tesseract OCR.
    
    Args:
        image_path: Path to image file
        config: Tesseract configuration string (default: --psm 6)
        
    Returns:
        Extracted text string
    """
    # Load image
    image = load_image(image_path)
    if image is None:
        logger.error(f"Failed to load image: {image_path}")
        return ""
    
    try:
        # Preprocess image
        processed = preprocess_image(image)
        
        # Convert numpy array to PIL Image for pytesseract
        pil_image = Image.fromarray(processed)
        
        # Run Tesseract OCR
        text = pytesseract.image_to_string(pil_image, config=config)
        
        logger.info(f"Text extraction completed for: {image_path}")
        logger.debug(f"Extracted {len(text)} characters")
        
        return text.strip()
        
    except Exception as e:
        logger.error(f"OCR extraction failed for {image_path}: {e}")
        return ""


def extract_text_with_confidence(
    image_path: str, 
    config: str = "--psm 6"
) -> Tuple[str, float]:
    """
    Extract text from image and compute average confidence score.
    
    Uses pytesseract.image_to_data() to get confidence levels
    for each text block.
    
    Args:
        image_path: Path to image file
        config: Tesseract configuration string
        
    Returns:
        Tuple of (extracted_text, confidence_score)
        confidence_score is between 0.0 and 100.0
    """
    # Load image
    image = load_image(image_path)
    if image is None:
        logger.error(f"Failed to load image: {image_path}")
        return ("", 0.0)
    
    try:
        # Preprocess image
        processed = preprocess_image(image)
        
        # Convert to PIL Image
        pil_image = Image.fromarray(processed)
        
        # Get text data with confidence
        data = pytesseract.image_to_data(pil_image, config=config, output_type=pytesseract.Output.DICT)
        
        # Extract text and calculate confidence
        texts = []
        confidences = []
        
        for i, text in enumerate(data['text']):
            # Only consider text blocks with actual content
            text = text.strip()
            if text and len(text) > 0:
                texts.append(text)
                conf = int(data['conf'][i])
                # Only include valid confidence values (0-100)
                if conf > 0:
                    confidences.append(conf)
        
        # Calculate average confidence
        if confidences:
            avg_confidence = sum(confidences) / len(confidences)
        else:
            avg_confidence = 0.0
        
        # Join all text
        full_text = ' '.join(texts)
        
        logger.info(
            f"Text extraction with confidence completed for: {image_path} "
            f"(confidence: {avg_confidence:.2f}%)"
        )
        
        return (full_text, avg_confidence)
        
    except Exception as e:
        logger.error(f"OCR extraction with confidence failed for {image_path}: {e}")
        return ("", 0.0)


def extract_text_blocks(image_path: str, config: str = "--psm 6") -> list[dict]:
    """
    Extract text blocks with position and confidence data.
    
    Useful for advanced parsing and spatial analysis.
    
    Args:
        image_path: Path to image file
        config: Tesseract configuration string
        
    Returns:
        List of dictionaries with text, confidence, and bounding box
    """
    # Load image
    image = load_image(image_path)
    if image is None:
        return []
    
    try:
        # Preprocess image
        processed = preprocess_image(image)
        pil_image = Image.fromarray(processed)
        
        # Get detailed data
        data = pytesseract.image_to_data(pil_image, config=config, output_type=pytesseract.Output.DICT)
        
        blocks = []
        for i in range(len(data['text'])):
            text = data['text'][i].strip()
            if text:  # Only include non-empty text
                blocks.append({
                    'text': text,
                    'confidence': int(data['conf'][i]),
                    'left': data['left'][i],
                    'top': data['top'][i],
                    'width': data['width'][i],
                    'height': data['height'][i],
                    'line_num': data['line_num'][i],
                    'block_num': data['block_num'][i],
                })
        
        logger.info(f"Extracted {len(blocks)} text blocks from: {image_path}")
        return blocks
        
    except Exception as e:
        logger.error(f"Failed to extract text blocks from {image_path}: {e}")
        return []
