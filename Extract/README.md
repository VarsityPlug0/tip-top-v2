# Social Media Profile Extractor

A production-ready Python application that extracts structured profile data from social media screenshots using OCR.

## Features

- **OCR-powered extraction**: Uses Tesseract OCR with advanced image preprocessing
- **Batch processing**: Process single images or entire folders
- **Structured output**: Extracts display name, username, email, followers, following, likes, and bio
- **Confidence scoring**: Reliability scores for each extracted field
- **Multiple export formats**: JSON and CSV output
- **REST API**: FastAPI endpoint for integration
- **Error handling**: Graceful handling of invalid images and OCR failures
- **Extensible design**: Modular architecture for adding platform-specific parsers

## Installation

### 1. Install Tesseract OCR

**Windows:**
```bash
# Download installer from: https://github.com/UB-Mannheim/tesseract/wiki
# Run the installer and note the installation path (default: C:\Program Files\Tesseract-OCR)
```

**macOS:**
```bash
brew install tesseract
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install tesseract-ocr
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Tesseract Path (Windows only)

If Tesseract is not in your system PATH, set the environment variable:

```python
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
```

Or add to your system PATH:
```bash
setx PATH "%PATH%;C:\Program Files\Tesseract-OCR"
```

## Usage

### CLI Interface

**Process a single image:**
```bash
python -m src.main --input image.png
```

**Process a folder of images:**
```bash
python -m src.main --input ./screenshots --output results.json
```

**Export to CSV:**
```bash
python -m src.main --input ./screenshots --output results.csv --format csv
```

**Custom OCR configuration:**
```bash
python -m src.main --input image.png --psm 6
```

**Quiet mode (no console output):**
```bash
python -m src.main --input image.png --output results.json --quiet
```

### CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--input` | `-i` | Input image file or folder path (required) | - |
| `--output` | `-o` | Output file path | - |
| `--format` | `-f` | Export format (json or csv) | json |
| `--psm` | - | Tesseract PSM mode | 6 |
| `--quiet` | `-q` | Suppress console output | False |

### REST API

**Start the API server:**
```bash
python api.py
```

Or using uvicorn directly:
```bash
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: `http://localhost:8000`

**API Documentation:**
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### API Endpoints

#### Health Check
```bash
curl http://localhost:8000/
```

**Response:**
```json
{
  "status": "healthy",
  "service": "Social Media Profile Extractor API",
  "version": "1.0.0"
}
```

#### Extract Profile (Single Image)
```bash
curl -X POST http://localhost:8000/extract \
  -F "file=@profile_screenshot.png"
```

**Response:**
```json
{
  "status": "success",
  "filename": "profile_screenshot.png",
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
  },
  "ocr_confidence": 87.45
}
```

#### Extract Profiles (Batch)
```bash
curl -X POST http://localhost:8000/extract/batch \
  -F "files=@image1.png" \
  -F "files=@image2.png"
```

**Response:**
```json
{
  "status": "completed",
  "total": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    {
      "filename": "image1.png",
      "status": "success",
      "data": { ... },
      "ocr_confidence": 87.45
    },
    {
      "filename": "image2.png",
      "status": "success",
      "data": { ... },
      "ocr_confidence": 82.30
    }
  ]
}
```

## Output Format

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

### CSV Format

The CSV export includes all fields with separate columns for confidence scores:
- image_path
- ocr_confidence
- display_name, username, email
- followers, following, likes
- bio
- confidence_display_name, confidence_username, confidence_email
- confidence_followers, confidence_following, confidence_likes
- confidence_bio

## Architecture

```
Extract/
├── src/
│   ├── __init__.py          # Package initialization
│   ├── ocr.py               # OCR and image preprocessing
│   ├── parser.py            # Data extraction and parsing
│   ├── utils.py             # Utility functions
│   └── main.py              # CLI interface and batch processing
├── api.py                   # FastAPI REST API
├── requirements.txt         # Python dependencies
└── README.md               # Documentation
```

### Module Responsibilities

- **ocr.py**: Image preprocessing (grayscale, blur, thresholding), Tesseract OCR integration, confidence calculation
- **parser.py**: Regex-based extraction, keyword matching, field parsing, confidence scoring
- **utils.py**: Numeric conversion (K, M, B), text cleaning, image validation, file operations
- **main.py**: CLI commands, batch processing, result export (JSON/CSV)
- **api.py**: FastAPI endpoints, file upload handling, error responses

## Image Preprocessing Pipeline

1. **Grayscale conversion**: Converts color images to grayscale
2. **Resizing**: Upscales small images (< 300px width) for better OCR
3. **Gaussian blur**: 5x5 kernel to reduce noise
4. **Otsu's thresholding**: Automatic binarization
5. **Morphological closing**: Removes small artifacts

## Tesseract PSM Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| 3 | Fully automatic page segmentation | General purpose (default) |
| 4 | Assume a single column of text | Multi-line profiles |
| 6 | Assume a single uniform block of text | Social media screenshots |
| 7 | Treat image as single text line | Single-line extraction |
| 11 | Sparse text | Layouts with spacing |

## Error Handling

The application handles errors gracefully:
- Invalid images are skipped with warnings
- OCR failures return empty fields
- Batch processing continues on individual failures
- All errors are logged with detailed messages
- No crashes on malformed input

## Extensibility

### Adding Platform-Specific Parsers

The modular design allows easy addition of platform-specific extraction logic:

```python
# Example: Instagram-specific parser
class InstagramParser(ProfileParser):
    def extract_stats(self, lines):
        # Instagram-specific keyword patterns
        pass
```

### Custom Preprocessing

Extend the preprocessing pipeline in `ocr.py`:

```python
def custom_preprocess(image):
    # Add your preprocessing steps
    pass
```

## Troubleshooting

### Tesseract Not Found
```
pytesseract.pytesseract.TesseractNotFoundError
```
**Solution:** Install Tesseract and add to PATH (see Installation section)

### Low OCR Accuracy
**Solutions:**
- Try different PSM modes (--psm 3, 4, 6, 7)
- Ensure high-quality screenshots
- Check image resolution (higher is better)
- Verify preprocessing steps are working

### Missing Fields
**Solutions:**
- Check if OCR text contains the information
- Review parser regex patterns
- Verify screenshot layout matches expected format
- Enable debug logging to see extracted text

## License

MIT License

## Contributing

Contributions are welcome! Please submit pull requests or open issues for bugs and feature requests.

## Support

For issues and questions, please open a GitHub issue.
