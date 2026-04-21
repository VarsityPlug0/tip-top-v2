"""
Parser module for extracting structured profile data from OCR text.
"""

import re
import logging
from typing import Optional

from .utils import convert_numeric, clean_text

logger = logging.getLogger(__name__)


def extract_username(text: str) -> str:
    """
    Extract username from OCR text using @pattern.
    
    Strategy:
    1. Look for @username patterns (not emails)
    2. Look for username-like text patterns near display name/email
    3. DO NOT use email prefix as username (it's not the same)
    
    Args:
        text: Cleaned OCR text
        
    Returns:
        Username string without @ symbol, or empty string
    """
    if not text:
        return ""
    
    # Common email domains to exclude (not usernames)
    email_domains = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'mail.com', 'aol.com', 'icloud.com', 'protonmail.com',
        'yandex.com', 'live.com', 'msn.com', 'inbox.com'
    ]
    
    # Strategy 1: Look for @username patterns (social media style)
    pattern = r'@([a-zA-Z0-9._]+)'
    matches = re.finditer(pattern, text)
    
    for match in matches:
        username = match.group(1).strip()
        
        # Skip if it looks like an email domain
        # Check if this @ is followed by a domain pattern
        full_match_context = text[max(0, match.start()-5):match.end()+10]
        
        # Skip common email domains
        is_email_domain = False
        for domain in email_domains:
            if domain in full_match_context.lower():
                is_email_domain = True
                break
        
        # Skip if username looks like an email domain (contains .com, .net, etc.)
        if re.match(r'^[a-zA-Z0-9._-]+\.(com|net|org|io|co)$', username, re.IGNORECASE):
            is_email_domain = True
        
        # Skip if it's part of an email address
        if '.' in username and any(ext in username.lower() for ext in ['com', 'net', 'org']):
            is_email_domain = True
        
        if not is_email_domain:
            logger.info(f"Username extracted: @{username}")
            return username
    
    # Strategy 2: Look for username-like patterns near email
    # Social media profiles usually show: Display Name → @username → Email
    email_pattern = r'[a-zA-Z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|mail|aol|icloud|protonmail)\.com'
    email_match = re.search(email_pattern, text, re.IGNORECASE)
    
    if email_match:
        email_pos = email_match.start()
        # Look 100 characters before email for username patterns
        before_email = text[max(0, email_pos-100):email_pos]
        
        # Look for patterns that could be usernames:
        # - Starts with letter, contains letters/numbers/dots/underscores
        # - Length 4-30 characters
        # - Not a common word or number
        username_patterns = re.finditer(r'\b([a-zA-Z][a-zA-Z0-9._]{3,30})\b', before_email)
        
        candidates = []
        skip_words = [
            'the', 'and', 'for', 'you', 'with', 'this', 'that', 'from',
            'rowie', 'lip', 'sync', 'above', 'below', 'subscription'
        ]
        
        for match in username_patterns:
            candidate = match.group(1).strip()
            # Skip common words, numbers, and very short/long strings
            if (candidate.lower() not in skip_words and 
                not candidate.isdigit() and 
                len(candidate) >= 4):
                candidates.append(candidate)
        
        # Return the last candidate (closest to email, likely the username)
        if candidates:
            username = candidates[-1]
            logger.info(f"Username extracted from context: {username}")
            return username
    
    logger.debug("No username found in text")
    return ""


def extract_email(text: str) -> str:
    """
    Extract email address using regex pattern.
    
    Args:
        text: Cleaned OCR text
        
    Returns:
        Email string or empty string
    """
    if not text:
        return ""
    
    # Email regex pattern
    pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    match = re.search(pattern, text)
    
    if match:
        email = match.group(0).strip()
        logger.info(f"Email extracted: {email}")
        return email
    
    logger.debug("No email found in text")
    return ""


def extract_stats(lines: list[str]) -> dict:
    """
    Extract follower, following, and like counts from text lines.
    
    Uses keyword matching for "Followers", "Following", "Likes".
    
    Args:
        lines: List of text lines
        
    Returns:
        Dictionary with followers, following, likes counts
    """
    stats = {
        'followers': 0,
        'following': 0,
        'likes': 0
    }
    
    if not lines:
        return stats
    
    # Join all lines for pattern matching
    full_text = ' '.join(lines)
    
    # Define patterns for each stat
    # Pattern: number (with optional K, M, B) followed by keyword
    patterns = {
        'followers': r'(\d[\d.,]*[KMBkmb]?)\s*(?:followers|fans)',
        'following': r'(\d[\d.,]*[KMBkmb]?)\s*(?:following|follows)',
        'likes': r'(\d[\d.,]*[KMBkmb]?)\s*(?:likes|hearts)',
    }
    
    # Also check reverse pattern: keyword followed by number
    reverse_patterns = {
        'followers': r'(?:followers|fans)\s*[:\-]?\s*(\d[\d.,]*[KMBkmb]?)',
        'following': r'(?:following|follows)\s*[:\-]?\s*(\d[\d.,]*[KMBkmb]?)',
        'likes': r'(?:likes|hearts)\s*[:\-]?\s*(\d[\d.,]*[KMBkmb]?)',
    }
    
    # Try forward patterns first
    for stat_name, pattern in patterns.items():
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            value_str = match.group(1)
            stats[stat_name] = convert_numeric(value_str)
            logger.info(f"{stat_name}: {stats[stat_name]} (from '{value_str}')")
            continue
        
        # Try reverse pattern
        match = re.search(reverse_patterns[stat_name], full_text, re.IGNORECASE)
        if match:
            value_str = match.group(1)
            stats[stat_name] = convert_numeric(value_str)
            logger.info(f"{stat_name}: {stats[stat_name]} (from '{value_str}')")
    
    return stats


def extract_display_name(lines: list[str], username: str) -> str:
    """
    Extract display name - typically the line before or near @username.
    
    Strategy:
    1. Find the line with username
    2. Look at preceding lines for display name
    3. Filter out UI elements and stats
    
    Args:
        lines: List of text lines
        username: Extracted username
        
    Returns:
        Display name string or empty string
    """
    if not lines:
        return ""
    
    # Common UI elements to exclude
    ui_keywords = [
        'followers', 'following', 'likes', 'posts', 'videos',
        'edit profile', 'share profile', 'settings', 'menu',
        'verified', 'follow', 'message'
    ]
    
    # Find username line index
    username_line_idx = -1
    for i, line in enumerate(lines):
        if username.lower() in line.lower() or f'@{username.lower()}' in line.lower():
            username_line_idx = i
            break
    
    # Search preceding lines for display name
    if username_line_idx > 0:
        # Check 1-2 lines before username
        for i in range(max(0, username_line_idx - 2), username_line_idx):
            candidate = lines[i].strip()
            
            # Skip empty lines
            if not candidate:
                continue
            
            # Skip lines that look like UI elements or stats
            if any(keyword in candidate.lower() for keyword in ui_keywords):
                continue
            
            # Skip lines that are just numbers
            if re.match(r'^[\d.,KMB]+$', candidate, re.IGNORECASE):
                continue
            
            # Skip lines with @ (likely usernames)
            if '@' in candidate:
                continue
            
            # This looks like a display name
            logger.info(f"Display name extracted: {candidate}")
            return candidate
    
    # Fallback: Look for first meaningful line that's not a stat
    for line in lines[:5]:  # Check first 5 lines
        candidate = line.strip()
        if not candidate:
            continue
        if any(keyword in candidate.lower() for keyword in ui_keywords):
            continue
        if re.match(r'^[\d.,KMB]+$', candidate, re.IGNORECASE):
            continue
        if '@' in candidate:
            continue
        
        logger.info(f"Display name extracted (fallback): {candidate}")
        return candidate
    
    logger.debug("No display name found")
    return ""


def extract_bio(lines: list[str], extracted_fields: dict) -> str:
    """
    Extract bio text - remaining meaningful lines after removing other fields.
    
    Args:
        lines: List of text lines
        extracted_fields: Dictionary of already extracted fields
        
    Returns:
        Bio text string or empty string
    """
    if not lines:
        return ""
    
    # Elements to exclude from bio
    exclude_keywords = [
        'followers', 'following', 'likes', 'posts', 'videos',
        'edit profile', 'share profile', 'settings', 'menu',
        'verified', 'follow', 'message'
    ]
    
    # Get username to exclude
    username = extracted_fields.get('username', '')
    
    bio_lines = []
    
    for line in lines:
        line = line.strip()
        
        # Skip empty lines
        if not line:
            continue
        
        # Skip lines with UI keywords
        if any(keyword in line.lower() for keyword in exclude_keywords):
            continue
        
        # Skip lines that are just numbers (stats)
        if re.match(r'^[\d.,KMB]+$', line, re.IGNORECASE):
            continue
        
        # Skip username line
        if username and (username.lower() in line.lower() or f'@{username.lower()}' in line.lower()):
            continue
        
        # Skip email line
        email = extracted_fields.get('email', '')
        if email and email in line:
            continue
        
        # Skip very short lines (likely UI elements)
        if len(line) < 3:
            continue
        
        bio_lines.append(line)
    
    # Join bio lines
    bio = ' '.join(bio_lines).strip()
    
    if bio:
        logger.info(f"Bio extracted ({len(bio)} characters)")
    else:
        logger.debug("No bio found")
    
    return bio


def calculate_field_confidence(field_value: str, ocr_confidence: float) -> float:
    """
    Calculate confidence score for an extracted field.
    
    Score is based on:
    - Base OCR confidence
    - Field validity checks
    
    Args:
        field_value: Extracted field value
        ocr_confidence: Base OCR confidence (0-100)
        
    Returns:
        Confidence score (0.0-1.0)
    """
    if not field_value:
        return 0.0
    
    # Base confidence from OCR (normalize to 0-1)
    base_confidence = ocr_confidence / 100.0
    
    # Adjust based on field characteristics
    adjustments = []
    
    # Email validation
    if '@' in field_value:
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        if re.match(email_pattern, field_value):
            adjustments.append(0.1)  # Valid email format
    
    # Username validation
    if field_value.startswith('@') or len(field_value) > 0:
        username_pattern = r'^@?[a-zA-Z0-9._]+$'
        if re.match(username_pattern, field_value):
            adjustments.append(0.05)  # Valid username format
    
    # Numeric validation
    if field_value.isdigit() or (field_value.replace('.', '').isdigit()):
        adjustments.append(0.05)  # Clean numeric
    
    # Length check - very short values are less reliable
    if len(field_value) < 2:
        adjustments.append(-0.2)
    elif len(field_value) < 4:
        adjustments.append(-0.05)
    
    # Calculate final confidence
    confidence = base_confidence + sum(adjustments)
    
    # Clamp to 0-1 range
    confidence = max(0.0, min(1.0, confidence))
    
    return round(confidence, 2)


def extract_profile_data(ocr_text: str, confidence: float = None) -> dict:
    """
    Main function to extract all profile data from OCR text.
    
    Args:
        ocr_text: Raw or cleaned OCR text
        confidence: Average OCR confidence score (0-100)
        
    Returns:
        Dictionary with all extracted profile fields and confidence scores
    """
    if not ocr_text:
        logger.warning("Empty OCR text provided")
        return {
            'display_name': '',
            'username': '',
            'email': '',
            'followers': 0,
            'following': 0,
            'likes': 0,
            'bio': '',
            'confidence': {
                'display_name': 0.0,
                'username': 0.0,
                'email': 0.0,
                'followers': 0.0,
                'following': 0.0,
                'likes': 0.0,
                'bio': 0.0
            }
        }
    
    try:
        # Clean text
        cleaned_text = clean_text(ocr_text)
        lines = [line.strip() for line in cleaned_text.split('\n') if line.strip()]
        
        # Use default confidence if not provided
        if confidence is None:
            confidence = 70.0  # Default moderate confidence
        
        logger.info(f"Starting profile data extraction from {len(lines)} lines")
        
        # Extract fields in dependency order
        username = extract_username(ocr_text)
        email = extract_email(ocr_text)
        stats = extract_stats(lines)
        
        # Build extracted fields dict for bio extraction
        extracted_fields = {
            'username': username,
            'email': email
        }
        
        display_name = extract_display_name(lines, username)
        bio = extract_bio(lines, extracted_fields)
        
        # Build result
        result = {
            'display_name': display_name,
            'username': username,
            'email': email,
            'followers': stats['followers'],
            'following': stats['following'],
            'likes': stats['likes'],
            'bio': bio
        }
        
        # Calculate confidence for each field
        result['confidence'] = {
            'display_name': calculate_field_confidence(display_name, confidence),
            'username': calculate_field_confidence(f'@{username}', confidence) if username else 0.0,
            'email': calculate_field_confidence(email, confidence),
            'followers': calculate_field_confidence(str(stats['followers']), confidence) if stats['followers'] > 0 else 0.0,
            'following': calculate_field_confidence(str(stats['following']), confidence) if stats['following'] > 0 else 0.0,
            'likes': calculate_field_confidence(str(stats['likes']), confidence) if stats['likes'] > 0 else 0.0,
            'bio': calculate_field_confidence(bio, confidence)
        }
        
        logger.info("Profile data extraction completed successfully")
        return result
        
    except Exception as e:
        logger.error(f"Error during profile data extraction: {e}")
        # Return empty result on failure
        return {
            'display_name': '',
            'username': '',
            'email': '',
            'followers': 0,
            'following': 0,
            'likes': 0,
            'bio': '',
            'confidence': {
                'display_name': 0.0,
                'username': 0.0,
                'email': 0.0,
                'followers': 0.0,
                'following': 0.0,
                'likes': 0.0,
                'bio': 0.0
            }
        }
