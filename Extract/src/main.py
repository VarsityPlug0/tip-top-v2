"""
Main module with CLI interface and batch processing functionality.
"""

import os
import sys
import json
import csv
import logging
from pathlib import Path
from typing import Optional

import click

from .ocr import extract_text_with_confidence
from .parser import extract_profile_data
from .utils import validate_image, get_image_files

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


def process_single_image(image_path: str, psm: int = 6) -> dict:
    """
    Process a single image and extract profile data.
    
    Args:
        image_path: Path to image file
        psm: Tesseract PSM mode
        
    Returns:
        Dictionary with extracted profile data
    """
    logger.info(f"Processing image: {image_path}")
    
    # Validate image
    if not validate_image(image_path):
        logger.error(f"Invalid image file: {image_path}")
        return {
            'error': f'Invalid image: {image_path}',
            'image_path': image_path
        }
    
    try:
        # Extract text with confidence
        config = f"--psm {psm}"
        text, confidence = extract_text_with_confidence(image_path, config=config)
        
        if not text:
            logger.warning(f"No text extracted from: {image_path}")
            return {
                'error': 'No text extracted',
                'image_path': image_path,
                'data': extract_profile_data('')
            }
        
        # Parse profile data
        profile_data = extract_profile_data(text, confidence)
        
        # Add image path to result
        result = {
            'image_path': image_path,
            'ocr_confidence': round(confidence, 2),
            'data': profile_data
        }
        
        logger.info(f"Successfully processed: {image_path}")
        return result
        
    except Exception as e:
        logger.error(f"Failed to process {image_path}: {e}")
        return {
            'error': str(e),
            'image_path': image_path
        }


def process_folder(folder_path: str, psm: int = 6) -> list[dict]:
    """
    Process all images in a folder.
    
    Args:
        folder_path: Path to folder containing images
        psm: Tesseract PSM mode
        
    Returns:
        List of result dictionaries
    """
    logger.info(f"Processing folder: {folder_path}")
    
    # Get all image files
    image_files = get_image_files(folder_path)
    
    if not image_files:
        logger.warning(f"No valid image files found in: {folder_path}")
        return []
    
    results = []
    total = len(image_files)
    
    for idx, image_path in enumerate(image_files, 1):
        logger.info(f"Processing image {idx}/{total}: {Path(image_path).name}")
        
        result = process_single_image(image_path, psm)
        results.append(result)
    
    # Summary
    successful = sum(1 for r in results if 'error' not in r)
    failed = total - successful
    
    logger.info(f"Folder processing completed: {successful}/{total} successful, {failed} failed")
    
    return results


def export_results(results: list[dict], output_path: str, format: str = "json") -> bool:
    """
    Export results to JSON or CSV file.
    
    Args:
        results: List of result dictionaries
        output_path: Output file path
        format: Export format ('json' or 'csv')
        
    Returns:
        True if export successful, False otherwise
    """
    try:
        # Ensure output directory exists
        output_dir = Path(output_path).parent
        if output_dir and not output_dir.exists():
            output_dir.mkdir(parents=True, exist_ok=True)
        
        if format.lower() == 'json':
            return export_json(results, output_path)
        elif format.lower() == 'csv':
            return export_csv(results, output_path)
        else:
            logger.error(f"Unsupported export format: {format}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to export results: {e}")
        return False


def export_json(results: list[dict], output_path: str) -> bool:
    """Export results to JSON file."""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Results exported to JSON: {output_path}")
        return True
        
    except Exception as e:
        logger.error(f"JSON export failed: {e}")
        return False


def export_csv(results: list[dict], output_path: str) -> bool:
    """Export results to CSV file."""
    try:
        if not results:
            logger.warning("No results to export")
            return False
        
        # Define CSV columns
        fieldnames = [
            'image_path',
            'ocr_confidence',
            'display_name',
            'username',
            'email',
            'followers',
            'following',
            'likes',
            'bio',
            'confidence_display_name',
            'confidence_username',
            'confidence_email',
            'confidence_followers',
            'confidence_following',
            'confidence_likes',
            'confidence_bio'
        ]
        
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            
            # Write header
            writer.writeheader()
            
            # Write data rows
            for result in results:
                if 'error' in result:
                    # Write error row
                    writer.writerow({
                        'image_path': result.get('image_path', ''),
                        'error': result.get('error', '')
                    })
                else:
                    # Flatten data structure
                    data = result.get('data', {})
                    confidence = data.get('confidence', {})
                    
                    row = {
                        'image_path': result.get('image_path', ''),
                        'ocr_confidence': result.get('ocr_confidence', 0),
                        'display_name': data.get('display_name', ''),
                        'username': data.get('username', ''),
                        'email': data.get('email', ''),
                        'followers': data.get('followers', 0),
                        'following': data.get('following', 0),
                        'likes': data.get('likes', 0),
                        'bio': data.get('bio', ''),
                        'confidence_display_name': confidence.get('display_name', 0),
                        'confidence_username': confidence.get('username', 0),
                        'confidence_email': confidence.get('email', 0),
                        'confidence_followers': confidence.get('followers', 0),
                        'confidence_following': confidence.get('following', 0),
                        'confidence_likes': confidence.get('likes', 0),
                        'confidence_bio': confidence.get('bio', 0)
                    }
                    
                    writer.writerow(row)
        
        logger.info(f"Results exported to CSV: {output_path}")
        return True
        
    except Exception as e:
        logger.error(f"CSV export failed: {e}")
        return False


def print_results(results: list[dict]) -> None:
    """Print results to console in a readable format."""
    if not results:
        logger.info("No results to display")
        return
    
    for idx, result in enumerate(results, 1):
        click.echo(f"\n{'='*60}")
        click.echo(f"Result {idx}: {result.get('image_path', 'Unknown')}")
        click.echo(f"{'='*60}")
        
        if 'error' in result:
            click.echo(f"Error: {result['error']}")
            continue
        
        # Print OCR confidence
        click.echo(f"OCR Confidence: {result.get('ocr_confidence', 0):.2f}%")
        click.echo(f"{'-'*60}")
        
        # Print extracted data
        data = result.get('data', {})
        click.echo(f"Display Name: {data.get('display_name', 'N/A')}")
        click.echo(f"Username: @{data.get('username', 'N/A')}")
        click.echo(f"Email: {data.get('email', 'N/A')}")
        click.echo(f"Followers: {data.get('followers', 0):,}")
        click.echo(f"Following: {data.get('following', 0):,}")
        click.echo(f"Likes: {data.get('likes', 0):,}")
        click.echo(f"Bio: {data.get('bio', 'N/A')}")
        click.echo(f"{'-'*60}")
        
        # Print confidence scores
        confidence = data.get('confidence', {})
        click.echo("Field Confidence Scores:")
        for field, score in confidence.items():
            bar = '█' * int(score * 10) + '░' * (10 - int(score * 10))
            click.echo(f"  {field:20s} [{bar}] {score:.2f}")
    
    click.echo(f"\n{'='*60}")
    click.echo(f"Total Results: {len(results)}")
    successful = sum(1 for r in results if 'error' not in r)
    click.echo(f"Successful: {successful}, Failed: {len(results) - successful}")
    click.echo(f"{'='*60}\n")


@click.command()
@click.option('--input', '-i', required=True, help='Input image file or folder path')
@click.option('--output', '-o', help='Output file path (JSON or CSV)')
@click.option('--format', '-f', type=click.Choice(['json', 'csv']), default='json', help='Export format')
@click.option('--psm', default=6, type=int, help='Tesseract PSM mode (default: 6)')
@click.option('--quiet', '-q', is_flag=True, help='Suppress console output')
def cli(input: str, output: Optional[str], format: str, psm: int, quiet: bool) -> None:
    """
    Social Media Profile Extractor
    
    Extract structured profile data from social media screenshots.
    
    Examples:
        python -m src.main --input image.png
        python -m src.main --input ./images --output results.json
        python -m src.main --input image.png --output results.csv --format csv
    """
    # Set logging level
    if quiet:
        logging.getLogger().setLevel(logging.WARNING)
    
    click.echo(f"Social Media Profile Extractor")
    click.echo(f"{'='*60}")
    click.echo(f"Input: {input}")
    
    # Determine if input is file or folder
    input_path = Path(input)
    
    if not input_path.exists():
        click.echo(f"Error: Input path does not exist: {input}")
        sys.exit(1)
    
    # Process based on input type
    if input_path.is_file():
        # Single image
        click.echo(f"Type: Single Image")
        click.echo(f"{'='*60}\n")
        
        result = process_single_image(str(input_path), psm)
        results = [result]
        
    elif input_path.is_dir():
        # Folder
        click.echo(f"Type: Folder")
        click.echo(f"{'='*60}\n")
        
        results = process_folder(str(input_path), psm)
        
    else:
        click.echo(f"Error: Invalid input path: {input}")
        sys.exit(1)
    
    # Print results
    if not quiet:
        print_results(results)
    
    # Export if output path provided
    if output and results:
        click.echo(f"Exporting results to: {output} (format: {format})")
        success = export_results(results, output, format)
        
        if success:
            click.echo(f"Export completed successfully!")
        else:
            click.echo(f"Export failed!")
            sys.exit(1)
    
    # Exit with error code if all failed
    successful = sum(1 for r in results if 'error' not in r)
    if successful == 0 and results:
        click.echo("Error: All images failed to process")
        sys.exit(1)


if __name__ == '__main__':
    cli()
