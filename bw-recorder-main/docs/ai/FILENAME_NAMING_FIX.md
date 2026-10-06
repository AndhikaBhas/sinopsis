# Filename Naming Scheme Fix

## Problem

The uploaded files via `rapat/upload` route were using a different naming scheme compared to files recorded via `rapat/create` (audio recorder):

**Before (rapat/upload - WRONG):**
```
rapat_{rapatId}_chunk_{chunk}_{timestamp}.{extension}
```
Example: `rapat_303_chunk_001_1760886631046.webm`

**Expected (rapat/create - CORRECT):**
```
{rapatId}_{chunkNumber}_{dateStr}_{timeStr}.{extension}
```
Example: `303_001_20241019_223045.webm`

## Root Cause

The worker.js file had its own implementation of `generateAudioFilename()` function that used:
- Different format structure
- Unix timestamp instead of formatted date/time
- "rapat_" prefix and "chunk_" text

This was inconsistent with the standard naming convention used by the audio recorder in `app/lib/utils.ts`.

## Solution

Updated the `generateAudioFilename()` function in `worker.js` to match the standard format:

### Before
```javascript
function generateAudioFilename(extension, chunkNumber, timestamp, rapatId) {
  const ts = timestamp || Date.now();
  const chunk = chunkNumber.toString().padStart(3, "0");
  return `rapat_${rapatId}_chunk_${chunk}_${ts}.${extension}`;
}
```

### After
```javascript
function generateAudioFilename(extension, chunkNumber, date, rapatId) {
  const timestamp = date || new Date();
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  const hours = String(timestamp.getHours()).padStart(2, "0");
  const minutes = String(timestamp.getMinutes()).padStart(2, "0");
  const seconds = String(timestamp.getSeconds()).padStart(2, "0");

  const chunkStr = String(chunkNumber).padStart(3, "0");
  const dateStr = `${year}${month}${day}`;
  const timeStr = `${hours}${minutes}${seconds}`;

  const safeRapatId = rapatId && rapatId !== "null" && rapatId.trim() !== "" ? rapatId : "mid";

  return `${safeRapatId}_${chunkStr}_${dateStr}_${timeStr}.${extension}`;
}
```

## Filename Format Specification

The standardized filename format consists of 4 parts separated by underscores:

### Format: `{rapatId}_{chunkNumber}_{dateStr}_{timeStr}.{extension}`

**1. Rapat ID:**
- The ID of the rapat/meeting
- If null, undefined, empty, or "null" string → defaults to "mid"
- Examples: `305`, `mid`

**2. Chunk Number:**
- 3-digit zero-padded chunk number
- Always `001` for uploaded files (single chunk)
- For audio recorder, increments: `001`, `002`, `003`, etc.
- Format: `String(chunkNumber).padStart(3, "0")`

**3. Date String:**
- Format: `YYYYMMDD`
- Uses current date when file is processed
- Example: `20241019` (October 19, 2024)

**4. Time String:**
- Format: `HHMMSS` (24-hour format)
- Uses current time when file is processed
- Example: `223045` (22:30:45 or 10:30:45 PM)

**5. Extension:**
- Determined from file MIME type
- `webm` for audio/webm
- `mp4` for audio/mp4 or audio/mp4a
- Falls back to original file extension or `mp4`

### Complete Examples

```
305_001_20241019_223045.webm
mid_001_20241019_143521.mp3
42_001_20241020_091530.mp4
```

## Implementation Details

### Worker.js Usage

The function is called in `processUploadJob()`:

```javascript
const chunkNumber = 1; // Always 1 for uploaded files
const fileName = generateAudioFilename(
  fileExtension, 
  chunkNumber, 
  undefined,  // Uses current date/time
  job.rapat_id.toString()
);
```

Parameters:
- `extension`: Determined from MIME type
- `chunkNumber`: Always 1 (uploaded files are not chunked)
- `date`: `undefined` → uses `new Date()` (current timestamp)
- `rapatId`: From `job.rapat_id` converted to string

### Audio Recorder Usage

For comparison, the audio recorder in `app/lib/utils.ts` uses:

```javascript
export function generateAudioFilename(
  extension: string = "webm",
  chunkNumber: number = 1,
  date?: Date,
  rapatId?: string
): string
```

Both implementations now generate identical filename formats.

## Benefits

### Consistency
- ✅ Same naming scheme for uploaded and recorded files
- ✅ Predictable file ordering
- ✅ Clear identification of source meeting

### Readability
- ✅ Human-readable date and time
- ✅ No need to convert Unix timestamps
- ✅ Easy to identify when file was created

### Sortability
- ✅ Files sort chronologically by name
- ✅ Date format YYYYMMDD sorts correctly
- ✅ Time format HHMMSS sorts correctly

### Processing
- ✅ Backend processing pipeline can parse filenames consistently
- ✅ Same validation logic for all files
- ✅ Simplified error handling

## Testing

To verify the fix:

1. **Start worker:**
   ```bash
   npm run dev:worker
   ```

2. **Upload a file via rapat/upload:**
   - Go to http://localhost:5173/rapat
   - Click "Unggah Rekaman"
   - Fill form and upload an audio file
   - Submit

3. **Check MinIO bucket:**
   - Check the filename in MinIO storage
   - Should match format: `{rapatId}_001_{YYYYMMDD}_{HHMMSS}.{ext}`
   - Example: `305_001_20241019_223045.mp3`

4. **Check database:**
   ```sql
   SELECT nama_file_audio FROM rapat_chunk ORDER BY created_at DESC LIMIT 1;
   ```
   Should show the new format.

5. **Compare with audio recorder:**
   - Create a new rapat via "Rekam Rapat"
   - Record audio and finish
   - Check filename format - should match upload format

## Files Modified

1. **worker.js**
   - Updated `generateAudioFilename()` function
   - Matches format from `app/lib/utils.ts`
   - Uses proper date/time formatting

## Future Considerations

### Date Source
Currently uses server time when processing. Consider:
- Using upload time from job creation
- Extracting creation time from file metadata
- Adding timezone support for different regions

### Chunk Numbers
Uploaded files always use `001`. For future multi-part uploads:
- Support splitting large files into chunks
- Increment chunk numbers: `001`, `002`, `003`
- Maintain chronological ordering

### Rapat ID Handling
Current behavior when rapat_id is null/invalid:
- Defaults to "mid" (meeting ID)
- Consider more descriptive defaults
- Add validation to prevent null IDs

### File Extensions
Current logic handles common formats. Consider:
- More extensive MIME type mapping
- Support for additional audio formats
- Preservation of original extension when appropriate
