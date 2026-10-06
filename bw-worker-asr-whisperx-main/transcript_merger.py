import os
import logging
import json
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

def get_db_connection():
    """Get database connection."""
    DATABASE_URL = os.getenv('DATABASE_URL')
    return psycopg2.connect(DATABASE_URL)

def check_meeting_status(rapat_id):
    """
    Check if a meeting is complete by checking status_rapat field.
    
    Args:
        rapat_id (int): The ID of the meeting to check
        
    Returns:
        bool: True if meeting is complete (status_rapat = "2"), False otherwise
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT status_rapat FROM rapat WHERE id = %s",
            (rapat_id,)
        )
        result = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        if result:
            status = result[0]
            is_complete = str(status) == "2"
            logger.info(f"Meeting {rapat_id} status: {status} ({'Complete' if is_complete else 'Incomplete'})")
            return is_complete
        else:
            logger.warning(f"Meeting {rapat_id} not found")
            return False
            
    except Exception as e:
        logger.error(f"Error checking meeting status for rapat_id {rapat_id}: {e}")
        return False

def count_meeting_chunks(rapat_id):
    """
    Count all rapat_chunk records related to a meeting.
    
    Args:
        rapat_id (int): The ID of the meeting
        
    Returns:
        dict: Dictionary containing chunk counts and details
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Count total chunks
        cursor.execute(
            "SELECT COUNT(*) FROM rapat_chunk WHERE rapat_id = %s",
            (rapat_id,)
        )
        total_chunks = cursor.fetchone()[0]
        
        # Count chunks with transcripts
        cursor.execute(
            "SELECT COUNT(*) FROM rapat_chunk WHERE rapat_id = %s AND transkrip IS NOT NULL",
            (rapat_id,)
        )
        transcribed_chunks = cursor.fetchone()[0]
        
        # Count chunks without transcripts
        pending_chunks = total_chunks - transcribed_chunks
        
        cursor.close()
        conn.close()
        
        result = {
            'rapat_id': rapat_id,
            'total_chunks': total_chunks,
            'transcribed_chunks': transcribed_chunks,
            'pending_chunks': pending_chunks,
            'completion_percentage': round((transcribed_chunks / total_chunks * 100) if total_chunks > 0 else 0, 2)
        }
        
        logger.info(f"Chunk count for meeting {rapat_id}: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Error counting chunks for rapat_id {rapat_id}: {e}")
        return None

def merge_meeting_transcripts(rapat_id):
    """
    Merge all transcripts from rapat_chunk for a meeting and store in rapat table.
    
    Args:
        rapat_id (int): The ID of the meeting
        
    Returns:
        bool: True if merge was successful, False otherwise
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get all chunks with transcripts for this meeting, ordered by urutan_chunk
        cursor.execute("""
            SELECT transkrip FROM rapat_chunk 
            WHERE rapat_id = %s AND transkrip IS NOT NULL 
            ORDER BY urutan_chunk
        """, (rapat_id,))
        
        results = cursor.fetchall()
        
        if not results:
            logger.warning(f"No transcripts found for meeting {rapat_id}")
            cursor.close()
            conn.close()
            return False
        
        # Merge all transcripts
        merged_transcript = []
        total_segments = 0
        
        for row in results:
            transcript_data = row[0]  # This is already parsed JSON from database
            if transcript_data:
                merged_transcript.extend(transcript_data)
                total_segments += len(transcript_data)
        
        # Save merged transcript to rapat table
        cursor.execute(
            "UPDATE rapat SET transkrip = %s WHERE id = %s",
            (Json(merged_transcript), rapat_id)
        )
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"Successfully merged {total_segments} segments from {len(results)} chunks for meeting {rapat_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error merging transcripts for meeting {rapat_id}: {e}")
        return False

def check_and_merge_meeting_transcripts(rapat_id):
    """
    Check if meeting is complete and merge transcripts if all chunks are transcribed.
    
    Args:
        rapat_id (int): The ID of the meeting to check
        
    Returns:
        bool: True if meeting was merged, False otherwise
    """
    print(f"\n{'='*50}")
    print(f"MEETING TRANSCRIPT MERGE - Rapat ID: {rapat_id}")
    print(f"{'='*50}")
    
    # Check meeting status
    is_complete = check_meeting_status(rapat_id)
    
    if not is_complete:
        print("⏳ Meeting Status: INCOMPLETE (status_rapat != 2)")
        print("   Meeting is still in progress or not yet finished")
        print(f"{'='*50}\n")
        return False
    
    print("✅ Meeting Status: COMPLETE (status_rapat = 2)")
    
    # Count chunks
    chunk_info = count_meeting_chunks(rapat_id)
    
    if not chunk_info:
        print("❌ Error retrieving chunk information")
        print(f"{'='*50}\n")
        return False
    
    print("\n📊 Chunk Statistics:")
    print(f"   Total Chunks: {chunk_info['total_chunks']}")
    print(f"   Transcribed: {chunk_info['transcribed_chunks']}")
    print(f"   Pending: {chunk_info['pending_chunks']}")
    print(f"   Completion: {chunk_info['completion_percentage']}%")
    
    if chunk_info['pending_chunks'] == 0:
        print("🎉 All chunks have been transcribed!")
        print("\n🔄 Starting transcript merge...")
        
        merge_success = merge_meeting_transcripts(rapat_id)
        
        if merge_success:
            print("✅ Transcripts successfully merged and saved to rapat table!")
            # Publish meeting complete message to output queue
            try:
                from worker import publish_meeting_complete
                publish_meeting_complete(rapat_id)
                print("📤 Meeting complete message published to output queue")
            except Exception as e:
                logger.error(f"Failed to publish meeting complete message: {e}")
        else:
            print("❌ Failed to merge transcripts")
            
        print(f"{'='*50}\n")
        return merge_success
    else:
        print(f"⚠️  {chunk_info['pending_chunks']} chunks still need transcription")
        print("   Cannot merge until all chunks are transcribed")
        print(f"{'='*50}\n")
        return False

def get_all_complete_meetings():
    """
    Get all meetings that are complete (status_rapat = "2").
    
    Returns:
        list: List of complete meeting IDs
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT id FROM rapat WHERE status_rapat = '2' ORDER BY id"
        )
        results = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        meeting_ids = [row[0] for row in results]
        logger.info(f"Found {len(meeting_ids)} complete meetings: {meeting_ids}")
        return meeting_ids
        
    except Exception as e:
        logger.error(f"Error getting complete meetings: {e}")
        return []

def merge_all_complete_meetings():
    """Check and merge transcripts for all complete meetings."""
    print("\n" + "="*60)
    print("MERGING TRANSCRIPTS FOR ALL COMPLETE MEETINGS")
    print("="*60)
    
    complete_meetings = get_all_complete_meetings()
    
    if not complete_meetings:
        print("No complete meetings found.")
        return
    
    print(f"Found {len(complete_meetings)} complete meeting(s)")
    
    merged_count = 0
    for rapat_id in complete_meetings:
        if check_and_merge_meeting_transcripts(rapat_id):
            merged_count += 1
    
    print(f"\n🎯 Summary: {merged_count}/{len(complete_meetings)} meetings had transcripts merged")
    print("="*60)