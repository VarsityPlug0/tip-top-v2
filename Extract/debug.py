from src.ocr import extract_text_blocks

blocks = extract_text_blocks('photo_5990268060163574842_y.jpg')
print(f"Total blocks: {len(blocks)}\n")
for i, b in enumerate(blocks):
    print(f"{i+1}. '{b['text']}' (conf: {b['confidence']})")
