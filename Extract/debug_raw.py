"""Debug script to show ALL OCR text including special characters"""
import pytesseract
from PIL import Image
from src.utils import load_image
from src.ocr import preprocess_image

# Load image
image = load_image('photo_5990268060163574842_y.jpg')

# Preprocess
processed = preprocess_image(image)

# Convert to PIL
pil_image = Image.fromarray(processed)

# Method 1: Raw text with default config
print("="*80)
print("METHOD 1: Raw text (default config)")
print("="*80)
raw_text = pytesseract.image_to_string(pil_image)
print(repr(raw_text))  # Show with special chars
print()

# Method 2: With PSM 6
print("="*80)
print("METHOD 2: PSM 6 (uniform block)")
print("="*80)
raw_text_psm6 = pytesseract.image_to_string(pil_image, config='--psm 6')
print(repr(raw_text_psm6))
print()

# Method 3: With PSM 3 (fully automatic)
print("="*80)
print("METHOD 3: PSM 3 (fully automatic)")
print("="*80)
raw_text_psm3 = pytesseract.image_to_string(pil_image, config='--psm 3')
print(repr(raw_text_psm3))
print()

# Method 4: All text blocks with positions (PSM 6)
print("="*80)
print("METHOD 4: All text blocks with data (PSM 6)")
print("="*80)
data = pytesseract.image_to_data(pil_image, config='--psm 6', output_type=pytesseract.Output.DICT)
for i in range(len(data['text'])):
    text = data['text'][i]
    if text.strip():  # Only show non-empty
        print(f"Block {i:3d} | Conf: {data['conf'][i]:3d}% | Pos: ({data['left'][i]:4d},{data['top'][i]:4d}) | '{text}'")

print("\n" + "="*80)
print("SEARCHING FOR @ SYMBOLS")
print("="*80)
full_text = raw_text_psm6
for i, char in enumerate(full_text):
    if char == '@':
        start = max(0, i-20)
        end = min(len(full_text), i+20)
        context = full_text[start:end].replace('\n', '\\n')
        print(f"Position {i}: ...{context}...")

print("\n" + "="*80)
print("ALL POTENTIAL USERNAMES (alphanumeric patterns)")
print("="*80)
import re
for match in re.finditer(r'@?([a-zA-Z][a-zA-Z0-9._]{3,30})', raw_text_psm6):
    print(f"  '{match.group(0)}' at position {match.start()}")
