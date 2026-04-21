"""
Utility functions for image validation, text cleaning, and numeric conversion.
"""

import os
import re
import logging
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Supported image extensions
VALID_EXTENSIONS = {'.png', '.jpg', '.jpeg'}


def convert_numeric(value: str) -> int:
    """
    Convert numeric strings with suffixes to integers.
    
    Examples:
        "108.6K" -> 108600
        "1.2M" -> 1200000
        "500" -> 500
        "2.5B" -> 2500000000
    
    Args:
        value: String containing numeric value with optional suffix
        
    Returns:
        Integer representation of the value
    """
    if not value or not isinstance(value, str):
        return 0
    
    # Clean the value
    value = value.strip().upper()
    
    # Remove commas and spaces
    value = value.replace(',', '').replace(' ', '')
    
    # Define suffix multipliers
    suffixes = {
        'K': 1_000,
        'M': 1_000_000,
        'B': 1_000_000_000,
    }
    
    try:
        # Check if value has a suffix
        for suffix, multiplier in suffixes.items():
            if value.endswith(suffix):
                # Remove suffix and convert
                num_str = value[:-1]
                number = float(num_str)
                return int(number * multiplier)
        
        # No suffix, direct conversion
        return int(float(value))
        
    except (ValueError, IndexError) as e:
        logger.debug(f"Failed to convert '{value}' to numeric: {e}")
        return 0


def clean_text(text: str) -> str:
    """
    Clean and normalize OCR text.
    
    - Removes extra whitespace
    - Normalizes line breaks
    - Removes common UI noise characters
    - Strips leading/trailing whitespace
    
    Args:
        text: Raw OCR text
        
    Returns:
        Cleaned text string
    """
    if not text or not isinstance(text, str):
        return ""
    
    # Remove common UI symbols and artifacts
    # Keep alphanumeric, basic punctuation, and whitespace
    text = re.sub(r'[^\w\s@.,!?\'"-]', ' ', text)
    
    # Replace multiple spaces with single space
    text = re.sub(r' +', ' ', text)
    
    # Replace multiple newlines with double newline
    text = re.sub(r'\n+', '\n', text)
    
    # Remove leading/trailing whitespace on each line
    lines = [line.strip() for line in text.split('\n')]
    
    # Remove empty lines
    lines = [line for line in lines if line]
    
    return '\n'.join(lines).strip()


def validate_image(path: str) -> bool:
    """
    Validate if file exists and is a supported image format.
    
    Args:
        path: File path to validate
        
    Returns:
        True if valid image file, False otherwise
    """
    if not path:
        return False
    
    file_path = Path(path)
    
    # Check if file exists
    if not file_path.exists():
        logger.warning(f"File not found: {path}")
        return False
    
    # Check if file is not empty
    if file_path.stat().st_size == 0:
        logger.warning(f"File is empty: {path}")
        return False
    
    # Check file extension
    if file_path.suffix.lower() not in VALID_EXTENSIONS:
        logger.warning(f"Unsupported file format: {path}")
        return False
    
    # Try to open with PIL to verify it's a valid image
    try:
        with Image.open(file_path) as img:
            img.verify()
        return True
    except Exception as e:
        logger.warning(f"Invalid image file: {path} - {e}")
        return False


def load_image(path: str) -> Optional[np.ndarray]:
    """
    Load image from file path using OpenCV.
    
    Args:
        path: Path to image file
        
    Returns:
        numpy array of image, or None if loading fails
    """
    if not validate_image(path):
        return None
    
    try:
        # Read image with OpenCV
        image = cv2.imread(path)
        
        if image is None:
            logger.error(f"Failed to load image: {path}")
            return None
        
        logger.info(f"Successfully loaded image: {path} ({image.shape[1]}x{image.shape[0]})")
        return image
        
    except Exception as e:
        logger.error(f"Error loading image {path}: {e}")
        return None


def get_image_files(folder_path: str) -> list[str]:
    """
    Get all valid image files from a folder.
    
    Args:
        folder_path: Path to folder
        
    Returns:
        List of valid image file paths
    """
    folder = Path(folder_path)
    
    if not folder.exists() or not folder.is_dir():
        logger.error(f"Invalid folder path: {folder_path}")
        return []
    
    image_files = []
    
    for ext in VALID_EXTENSIONS:
        # Search both lowercase and uppercase extensions
        image_files.extend(folder.glob(f'*{ext}'))
        image_files.extend(folder.glob(f'*{ext.upper()}'))
    
    # Convert to strings and sort
    image_files = sorted([str(f) for f in set(image_files)])
    
    logger.info(f"Found {len(image_files)} image files in {folder_path}")
    return image_files
