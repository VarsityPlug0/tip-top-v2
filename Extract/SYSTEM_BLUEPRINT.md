# Social Media Profile Extractor - System Blueprint

## 📋 System Overview

**Purpose:** A production-ready Python application that extracts structured profile data from social media screenshots using OCR (Optical Character Recognition).

**Core Functionality:** Upload social media profile screenshots → OCR processing → Extract structured data (username, email, followers, etc.) → Export as JSON/CSV or via REST API.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACES                       │
├──────────────────────┬──────────────────────────────────┤
│   CLI (main.py)      │  REST API (api.py)               │
│   - Single image     │  - POST /extract                 │
│   - Batch folder     │  - POST /extract/batch           │
│   - JSON/CSV export  │  - Web UI (index.html)           │
└──────────────────────┴──────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   CORE PROCESSING                        │
├─────────────────────────────────────────────────────────┤
│  1. Image Validation (utils.py)                         │
│  2. Image Preprocessing (ocr.py)                        │
│  3. OCR Text Extraction (ocr.py)                        │
│  4. Data Parsing (parser.py)                            │
│  5. Result Export (main.py)                             │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure & Responsibilities

```
Extract/
├── src/
│   ├── __init__.py          # Package initialization
│   ├── ocr.py               # OCR & image preprocessing (241 lines)
│   ├── parser.py            # Data extraction logic (496 lines)
│   ├── utils.py             # Utility functions (204 lines)
│   └── main.py              # CLI & batch processing (364 lines)
├── api.py                   # FastAPI REST API (252 lines)
├── index.html               # Web UI frontend (511 lines)
├── requirements.txt         # Python dependencies
└── README.md               # Documentation
```

### Module Breakdown

#### 1. **utils.py** - Utility Functions
**Purpose:** Image validation, text cleaning, numeric conversion

**Key Functions:**
- `convert_numeric(value: str) -> int`: Converts "108.6K" → 108600, "1.2M" → 1200000
- `clean_text(text: str) -> str`: Removes OCR artifacts, normalizes whitespace
- `validate_image(path: str) -> bool`: Validates file exists, is valid image (PNG/JPG/JPEG)
- `load_image(path: str) -> np.ndarray`: Loads image using OpenCV
- `get_image_files(folder_path: str) -> list[str]`: Scans folder for images

**Supported Formats:** `.png`, `.jpg`, `.jpeg`

---

#### 2. **ocr.py** - OCR & Image Preprocessing
**Purpose:** Image enhancement and text extraction using Tesseract

**Image Preprocessing Pipeline:**
1. **Grayscale Conversion:** BGR → Grayscale (if color image)
2. **Resize:** Upscale if width < 300px (INTER_CUBIC interpolation)
3. **Gaussian Blur:** 5x5 kernel to reduce noise
4. **Adaptive Thresholding:** Gaussian adaptive threshold (blockSize=31, C=2)
5. **Morphological Closing:** 2x2 kernel to remove artifacts

**Key Functions:**
- `preprocess_image(image: np.ndarray) -> np.ndarray`: Applies 5-step pipeline
- `extract_text(image_path: str, config: str) -> str`: Basic OCR extraction
- `extract_text_with_confidence(image_path: str, config: str) -> Tuple[str, float]`: Returns text + confidence (0-100)
- `extract_text_blocks(image_path: str, config: str) -> list[dict]`: Returns text blocks with position data

**Tesseract Configuration:**
- Default PSM: 6 (assume single uniform block of text)
- Configurable via CLI: `--psm [3|4|6|7|11]`

---

#### 3. **parser.py** - Data Extraction Logic
**Purpose:** Parse OCR text to extract structured profile fields

**Extracted Fields:**
1. **username**: Social media handle (without @)
2. **email**: Email address
3. **display_name**: Full name shown on profile
4. **followers**: Follower count (integer)
5. **following**: Following count (integer)
6. **likes**: Total likes (integer)
7. **bio**: Profile description text
8. **confidence**: Per-field confidence scores (0.0-1.0)

**Extraction Strategies:**

**Username Extraction (`extract_username`):**
- Strategy 1: Regex `@([a-zA-Z0-9._]+)` pattern
- Filters out email domains (gmail.com, yahoo.com, etc.)
- Strategy 2: Context-based search near email address
- Skip words: 'the', 'and', 'rowie', 'lip', 'sync', etc.

**Email Extraction (`extract_email`):**
- Regex: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`

**Stats Extraction (`extract_stats`):**
- Forward patterns: `(\d[\d.,]*[KMBkmb]?)\s*(?:followers|fans)`
- Reverse patterns: `(?:followers|fans)\s*[:\-]?\s*(\d[\d.,]*[KMBkmb]?)`
- Uses `convert_numeric()` to handle K/M/B suffixes

**Display Name Extraction (`extract_display_name`):**
- Finds username line, looks 1-2 lines before it
- Filters out UI keywords: 'followers', 'following', 'edit profile', etc.
- Fallback: First meaningful line in first 5 lines

**Bio Extraction (`extract_bio`):**
- Remaining lines after excluding: username, email, stats, UI elements
- Joins all remaining meaningful lines

**Confidence Calculation (`calculate_field_confidence`):**
- Base: OCR confidence / 100
- Adjustments: +0.1 for valid email, +0.05 for valid username/numeric, -0.2 for very short values
- Clamped to 0.0-1.0 range

---

#### 4. **main.py** - CLI & Batch Processing
**Purpose:** Command-line interface and orchestration

**Key Functions:**
- `process_single_image(image_path: str, psm: int) -> dict`: Processes one image
- `process_folder(folder_path: str, psm: int) -> list[dict]`: Processes all images in folder
- `export_results(results: list, output_path: str, format: str) -> bool`: Exports to JSON/CSV
- `export_json(results: list, output_path: str) -> bool`: JSON export
- `export_csv(results: list, output_path: str) -> bool`: CSV export with flattened fields
- `print_results(results: list) -> None`: Console output with visual confidence bars

**CLI Options:**
```
--input, -i     Input image file or folder (required)
--output, -o    Output file path
--format, -f    Export format: json|csv (default: json)
--psm           Tesseract PSM mode (default: 6)
--quiet, -q     Suppress console output
```

**Usage Examples:**
```bash
# Single image
python -m src.main --input image.png

# Batch processing
python -m src.main --input ./screenshots --output results.json

# CSV export
python -m src.main --input ./images --output results.csv --format csv
```

---

#### 5. **api.py** - REST API
**Purpose:** FastAPI web service with file upload endpoints

**Endpoints:**

**GET /** - Health check
```json
{
  "status": "healthy",
  "service": "Social Media Profile Extractor API",
  "version": "1.0.0"
}
```

**POST /extract** - Single image extraction
- Accepts: `multipart/form-data` with `file` field
- Validates: File extension (PNG/JPG/JPEG), size (max 10MB)
- Process: Save to temp file → Call `process_single_image()` → Return result
- Response:
```json
{
  "status": "success",
  "filename": "image.png",
  "data": {
    "display_name": "Rowie",
    "username": "rowie_official",
    "email": "rowie@example.com",
    "followers": 108600,
    "following": 245,
    "likes": 2500000,
    "bio": "Content creator",
    "confidence": { ... }
  },
  "ocr_confidence": 87.45
}
```

**POST /extract/batch** - Multiple image extraction
- Accepts: Multiple files (max 10 per request)
- Response includes: total, successful, failed counts + results array

**Web UI:**
- Serves `index.html` at root `/`
- Drag-and-drop upload interface
- Real-time preview and result display
- Confidence meters for each field

**Security:**
- Temporary file cleanup in `finally` blocks
- File size validation (10MB max)
- Extension whitelist

---

#### 6. **index.html** - Web Frontend
**Purpose:** Modern, responsive UI for API interaction

**Features:**
- Drag-and-drop file upload
- Image preview before processing
- Animated loading spinner during processing
- Grid layout for extracted fields
- Confidence meters (visual progress bars)
- Stats cards with gradient backgrounds
- Error handling and display

**API Integration:**
- Uses `fetch()` to POST to `/extract`
- FormData for file upload
- Async/await for response handling

---

## 🔄 Data Flow

```
1. User Input
   ├─ CLI: Image path or folder
   ├─ API: File upload (multipart/form-data)
   └─ Web UI: Drag-drop → POST /extract

2. Validation
   └─ utils.validate_image()
      ├─ File exists?
      ├─ Valid extension? (PNG/JPG/JPEG)
      ├─ Non-empty file?
      └─ PIL can open it?

3. Preprocessing (ocr.py)
   └─ preprocess_image()
      ├─ Grayscale conversion
      ├─ Resize (if width < 300px)
      ├─ Gaussian blur (5x5)
      ├─ Adaptive threshold (blockSize=31)
      └─ Morphological closing (2x2 kernel)

4. OCR Extraction (ocr.py)
   └─ extract_text_with_confidence()
      ├─ pytesseract.image_to_data()
      ├─ Extract text blocks
      └─ Calculate average confidence

5. Parsing (parser.py)
   └─ extract_profile_data()
      ├─ clean_text()
      ├─ extract_username() → Strategy 1 (@pattern), Strategy 2 (context)
      ├─ extract_email() → Regex
      ├─ extract_stats() → Keyword matching + numeric conversion
      ├─ extract_display_name() → Position-based (before username)
      ├─ extract_bio() → Remaining meaningful lines
      └─ calculate_field_confidence() → Per-field scores

6. Output
   ├─ CLI: Console display + JSON/CSV file
   ├─ API: JSON response
   └─ Web UI: Formatted result cards
```

---

## 📦 Dependencies

```txt
pytesseract>=0.3.10      # Tesseract OCR Python wrapper
opencv-python>=4.8.0     # Image processing
Pillow>=10.0.0           # Image loading/validation
numpy>=1.24.0            # Array operations
click>=8.1.0             # CLI framework
fastapi>=0.104.0         # REST API framework
uvicorn>=0.24.0          # ASGI server
python-multipart>=0.0.6  # File upload parsing
```

**External Dependency:**
- **Tesseract OCR Engine** (must be installed separately)
  - Windows: `https://github.com/UB-Mannheim/tesseract/wiki`
  - macOS: `brew install tesseract`
  - Linux: `sudo apt-get install tesseract-ocr`

---

## 🎯 Key Design Patterns

### 1. **Pipeline Architecture**
```
Input → Validation → Preprocessing → OCR → Parsing → Output
```
Each stage is isolated in separate modules for maintainability.

### 2. **Strategy Pattern** (Username Extraction)
- Multiple strategies attempted sequentially
- Falls back to next strategy if previous fails
- Email domain filtering prevents false positives

### 3. **Confidence Scoring**
- Every extracted field has a confidence score (0.0-1.0)
- Based on OCR confidence + field-specific validations
- Helps users assess data reliability

### 4. **Graceful Degradation**
- Missing fields return empty strings/zeros (no crashes)
- Batch processing continues on individual failures
- All errors logged with detailed messages

### 5. **Dependency Injection** (Clean Architecture)
```
main.py → depends on → ocr.py, parser.py, utils.py
api.py → depends on → main.py (process_single_image)
parser.py → depends on → utils.py (convert_numeric, clean_text)
ocr.py → depends on → utils.py (load_image)
```

---

## 🔧 Configuration Points

### Tesseract PSM Modes
| Mode | Description | Best For |
|------|-------------|----------|
| 3 | Full auto segmentation | General purpose |
| 4 | Single column text | Multi-line profiles |
| **6** | **Single uniform block** | **Social media screenshots (default)** |
| 7 | Single text line | Single-line extraction |
| 11 | Sparse text | Layouts with spacing |

### Image Preprocessing Parameters
- **Min width for resize:** 300px
- **Gaussian blur kernel:** 5x5
- **Adaptive threshold blockSize:** 31
- **Adaptive threshold C:** 2
- **Morphological kernel:** 2x2

### API Limits
- **Max file size:** 10MB
- **Max batch files:** 10 per request
- **Supported formats:** PNG, JPG, JPEG

---

## 📊 Output Format

### JSON Structure
```json
{
  "image_path": "path/to/image.png",
  "ocr_confidence": 87.45,
  "data": {
    "display_name": "Rowie",
    "username": "rowie_official",
    "email": "rowie@example.com",
    "followers": 108600,
    "following": 245,
    "likes": 2500000,
    "bio": "Content creator | Digital artist",
    "confidence": {
      "display_name": 0.92,
      "username": 0.98,
      "email": 0.95,
      "followers": 0.88,
      "following": 0.85,
      "likes": 0.87,
      "bio": 0.75
    }
  }
}
```

### CSV Columns
```
image_path, ocr_confidence,
display_name, username, email,
followers, following, likes,
bio,
confidence_display_name, confidence_username, confidence_email,
confidence_followers, confidence_following, confidence_likes,
confidence_bio
```

---

## 🚀 Deployment

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Install Tesseract OCR (see README.md)

# Run CLI
python -m src.main --input image.png

# Start API server
python api.py
# OR
uvicorn api:app --reload --host 0.0.0.0 --port 8000

# Access Web UI
http://localhost:8000
```

### Production Considerations
1. **Tesseract Path:** Set `pytesseract.pytesseract.tesseract_cmd` if not in PATH
2. **Temp File Cleanup:** API uses `tempfile` with `delete=False` + manual cleanup
3. **Logging:** Configure logging level and handlers for production
4. **Error Handling:** All endpoints return structured error responses
5. **File Validation:** Strict extension whitelist and size limits

---

## 🔍 Extensibility Points

### 1. Add Platform-Specific Parsers
```python
# Example: Instagram-specific parser
class InstagramParser(ProfileParser):
    def extract_stats(self, lines):
        # Instagram uses "Posts" instead of "Likes"
        pass
```

### 2. Custom Preprocessing
Extend `preprocess_image()` in `ocr.py`:
```python
def custom_preprocess(image):
    # Add deskewing, contrast enhancement, etc.
    pass
```

### 3. New Export Formats
Add to `export_results()` in `main.py`:
```python
elif format.lower() == 'xml':
    return export_xml(results, output_path)
```

### 4. Additional Fields
Modify `extract_profile_data()` in `parser.py`:
```python
# Add extraction for: website, location, verified status, etc.
```

---

## ⚠️ Common Pitfalls & Solutions

### 1. **Tesseract Not Found**
```
pytesseract.pytesseract.TesseractNotFoundError
```
**Solution:** Install Tesseract and add to system PATH

### 2. **Low OCR Accuracy**
**Solutions:**
- Try different PSM modes (3, 4, 6, 7)
- Ensure high-resolution screenshots
- Check preprocessing pipeline is working
- Adjust adaptive threshold parameters

### 3. **Missing Username**
**Cause:** OCR didn't detect @ symbol or username looks like email
**Solution:** 
- Check extracted text in logs
- Adjust `extract_username()` regex patterns
- Add skip words for false positives

### 4. **Incorrect Stats (Followers/Likes)**
**Cause:** OCR misread numbers or format not matching patterns
**Solution:**
- Check if stats use different keywords (e.g., "Fans" vs "Followers")
- Verify numeric conversion handles all formats
- Update regex patterns in `extract_stats()`

---

## 📝 Testing Strategy

### Manual Testing
```bash
# Test with sample image
python -m src.main --input test_image.png

# Test batch processing
python -m src.main --input ./test_images --output results.json

# Test API
curl -X POST http://localhost:8000/extract -F "file=@test.png"

# Test batch API
curl -X POST http://localhost:8000/extract/batch \
  -F "files=@img1.png" -F "files=@img2.png"
```

### Validation Checklist
- [ ] Image validation rejects invalid files
- [ ] OCR extracts text from clear screenshots
- [ ] Username extraction handles @pattern and context
- [ ] Email extraction uses correct regex
- [ ] Stats conversion handles K/M/B suffixes
- [ ] Display name found before username
- [ ] Bio excludes UI elements and other fields
- [ ] Confidence scores are reasonable (0.0-1.0)
- [ ] JSON/CSV export formats correctly
- [ ] API handles file upload errors gracefully

---

## 🎓 Key Insights for Agent Implementation

1. **Order Matters:** Extract fields in dependency order (username → display name, email → bio)
2. **Confidence is Critical:** Always provide per-field confidence scores
3. **Multiple Strategies:** Don't rely on single extraction method; use fallbacks
4. **Preprocessing is Key:** 80% of OCR accuracy comes from good image preprocessing
5. **Error Handling:** Never crash on bad input; return empty/default values
6. **Logging:** Extensive logging helps debug extraction issues
7. **Validation:** Validate at every stage (file → image → text → parsed data)
8. **Extensibility:** Modular design allows easy addition of new platforms/formats

---

## 📞 Quick Reference

### Entry Points
- **CLI:** `python -m src.main --input <path>`
- **API:** `python api.py` → `http://localhost:8000`
- **Programmatic:** Import from `src.ocr`, `src.parser`, `src.main`

### Core Functions
```python
# Process single image
from src.main import process_single_image
result = process_single_image("image.png", psm=6)

# Extract text
from src.ocr import extract_text_with_confidence
text, confidence = extract_text_with_confidence("image.png")

# Parse profile
from src.parser import extract_profile_data
profile = extract_profile_data(text, confidence)
```

### API Endpoints
- `GET /` - Health check
- `POST /extract` - Single image
- `POST /extract/batch` - Multiple images
- `GET /docs` - Swagger UI

---

**Blueprint Version:** 1.0  
**Last Updated:** 2026-04-19  
**System Version:** 1.0.0
