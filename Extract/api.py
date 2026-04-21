"""
FastAPI application for Social Media Profile Extractor.

Provides REST API endpoint for image processing.
"""

import os
import tempfile
import logging
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from src.main import process_single_image

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Social Media Profile Extractor API",
    description="Extract structured profile data from social media screenshots",
    version="1.0.0"
)

# Serve the web interface
@app.get("/", response_class=HTMLResponse)
async def serve_ui():
    """Serve the web interface."""
    html_file = Path(__file__).parent / "index.html"
    if html_file.exists():
        return html_file.read_text(encoding="utf-8")
    return HTMLResponse("<h1>UI not found</h1>")

# Supported image formats
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg'}


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Social Media Profile Extractor API",
        "version": "1.0.0"
    }


@app.post("/extract")
async def extract_profile(file: UploadFile = File(...)):
    """
    Extract profile data from uploaded image.
    
    Accepts PNG, JPG, or JPEG images.
    
    Returns structured JSON with:
    - display_name
    - username
    - email
    - followers count
    - following count
    - likes count
    - bio
    - confidence scores
    """
    # Validate filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {file_ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Validate file size (max 10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    
    try:
        # Read file content
        content = await file.read()
        
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024)}MB"
            )
        
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file")
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Process image
            logger.info(f"Processing uploaded image: {file.filename}")
            result = process_single_image(tmp_path)
            
            # Check for errors
            if 'error' in result:
                raise HTTPException(
                    status_code=500,
                    detail=f"Processing failed: {result['error']}"
                )
            
            # Return successful result
            return JSONResponse(
                status_code=200,
                content={
                    "status": "success",
                    "filename": file.filename,
                    "data": result.get('data', {}),
                    "ocr_confidence": result.get('ocr_confidence', 0)
                }
            )
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_path)
                logger.debug(f"Temporary file deleted: {tmp_path}")
            except Exception as e:
                logger.warning(f"Failed to delete temporary file: {e}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during processing: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@app.post("/extract/batch")
async def extract_profile_batch(files: list[UploadFile] = File(...)):
    """
    Extract profile data from multiple uploaded images.
    
    Accepts multiple PNG, JPG, or JPEG images.
    
    Returns list of results.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    if len(files) > 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 files allowed per request"
        )
    
    results = []
    
    for file in files:
        # Validate file extension
        file_ext = Path(file.filename).suffix.lower() if file.filename else ''
        
        if file_ext not in ALLOWED_EXTENSIONS:
            results.append({
                "filename": file.filename,
                "status": "error",
                "error": f"Unsupported format: {file_ext}"
            })
            continue
        
        try:
            # Read and validate file
            content = await file.read()
            
            if len(content) == 0:
                results.append({
                    "filename": file.filename,
                    "status": "error",
                    "error": "Empty file"
                })
                continue
            
            # Save to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
                tmp_file.write(content)
                tmp_path = tmp_file.name
            
            try:
                # Process image
                result = process_single_image(tmp_path)
                
                if 'error' in result:
                    results.append({
                        "filename": file.filename,
                        "status": "error",
                        "error": result['error']
                    })
                else:
                    results.append({
                        "filename": file.filename,
                        "status": "success",
                        "data": result.get('data', {}),
                        "ocr_confidence": result.get('ocr_confidence', 0)
                    })
            
            finally:
                # Clean up
                try:
                    os.unlink(tmp_path)
                except:
                    pass
        
        except Exception as e:
            logger.error(f"Error processing {file.filename}: {e}")
            results.append({
                "filename": file.filename,
                "status": "error",
                "error": str(e)
            })
    
    return JSONResponse(
        status_code=200,
        content={
            "status": "completed",
            "total": len(files),
            "successful": sum(1 for r in results if r['status'] == 'success'),
            "failed": sum(1 for r in results if r['status'] == 'error'),
            "results": results
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    # Run development server
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
