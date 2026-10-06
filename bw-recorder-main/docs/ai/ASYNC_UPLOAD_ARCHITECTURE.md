# Asynchronous Upload Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER UPLOAD FLOW                                │
└─────────────────────────────────────────────────────────────────────────┘

1. User Action (< 2 seconds)
   ┌─────────┐
   │ Browser │ ──── POST /rapat/upload ────▶ ┌────────────┐
   │  Form   │                                │   Server   │
   └─────────┘                                └─────┬──────┘
                                                    │
                                                    ▼
                                              ┌──────────┐
                                              │ Validate │
                                              │   File   │
                                              └────┬─────┘
                                                   │
                                                   ▼
                                              ┌─────────┐
                                              │  Save   │
                                              │ to Temp │
                                              └────┬────┘
                                                   │
                                                   ▼
                                           ┌────────────────┐
                                           │ Create Upload  │
                                           │  Job Record    │
                                           │ (status=pending)│
                                           └────────────────┘
                                                   │
   ┌─────────┐                                    │
   │ Browser │ ◀──── Redirect with JobID ─────────┘
   │  (2sec) │       /rapat?uploadJobId=xxx
   └─────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND WORKER FLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

2. Background Processing (5-30 seconds)
   
   ┌──────────────┐       Poll every 2s      ┌──────────────┐
   │   Database   │ ◀───────────────────────▶ │   Worker     │
   │  upload_job  │                           │   Process    │
   └──────────────┘                           └──────┬───────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │ Process Job │
                                              │ (10% - 90%) │
                                              └──────┬──────┘
                                                     │
                      ┌──────────────────────────────┼──────────────────┐
                      ▼                              ▼                  ▼
               ┌────────────┐              ┌──────────────┐    ┌───────────┐
               │   MinIO    │              │  rapat_chunk │    │ RabbitMQ  │
               │   Upload   │              │    Record    │    │  Publish  │
               └────────────┘              └──────────────┘    └───────────┘
                      │                              │                  │
                      └──────────────────────────────┼──────────────────┘
                                                     ▼
                                              ┌─────────────┐
                                              │ Update Job  │
                                              │ (completed) │
                                              └─────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                      USER STATUS MONITORING                             │
└─────────────────────────────────────────────────────────────────────────┘

3. Real-time Status Updates

   ┌─────────┐      Auto-refresh every 2s     ┌──────────────┐
   │ Browser │ ─────────────────────────────▶  │    Loader    │
   │  Page   │                                 │   Function   │
   └─────────┘                                 └──────┬───────┘
       │                                              │
       │                                              ▼
       │                                      ┌──────────────┐
       │                                      │   Database   │
       │                                      │  Query Job   │
       │                                      └──────┬───────┘
       │                                             │
       │ ◀─────── Job Status & Progress ─────────────┘
       │          (pending/processing/completed/failed)
       │
       ▼
   ┌──────────────────┐
   │  Display Status  │
   │  Progress Bar    │
   │  (0% - 100%)     │
   └──────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                       │
└─────────────────────────────────────────────────────────────────────────┘

Database Tables:
┌─────────────────┐       ┌──────────────────┐       ┌──────────────┐
│     rapat       │       │   upload_job     │       │ rapat_chunk  │
├─────────────────┤       ├──────────────────┤       ├──────────────┤
│ id (PK)         │◀──┐   │ id (UUID)        │       │ id (PK)      │
│ judul           │   └───│ rapat_id (FK)    │   ┌──▶│ rapat_id(FK) │
│ status_rapat    │       │ file_name        │   │   │ urutan_chunk │
│ ...             │       │ status           │   │   │ nama_file... │
└─────────────────┘       │ progress         │   │   └──────────────┘
                          │ temp_path        │   │
                          │ error_message    │   │
                          └──────────────────┘   │
                                                 │
                          Worker creates ────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                    STATUS TRANSITIONS                                   │
└─────────────────────────────────────────────────────────────────────────┘

Upload Job Status:
   pending ──▶ processing ──▶ completed
                    │
                    └───────▶ failed

Progress Updates:
   0% → 10% → 20% → 30% → 40% → 60% → 80% → 90% → 100%
   │    │     │     │     │     │     │     │     │
   │    │     │     │     │     │     │     │     └─ Completed
   │    │     │     │     │     │     │     └─ Update rapat
   │    │     │     │     │     │     └─ Publish RabbitMQ
   │    │     │     │     │     └─ Create chunk record
   │    │     │     │     └─ Upload to MinIO
   │    │     │     └─ Validate file
   │    │     └─ Read temp file
   │    └─ Start processing
   └─ Job found

Rapat Status:
   0 (created) ──▶ 2 (uploaded/finished)


┌─────────────────────────────────────────────────────────────────────────┐
│                    FAILURE HANDLING                                     │
└─────────────────────────────────────────────────────────────────────────┘

If Error Occurs:
   ┌──────────────┐
   │ Worker Error │
   └──────┬───────┘
          │
          ▼
   ┌──────────────────┐
   │  Update Job      │
   │  status='failed' │
   │  error_message   │
   └──────┬───────────┘
          │
          ▼
   ┌──────────────────┐
   │  Clean Temp File │
   └──────┬───────────┘
          │
          ▼
   ┌──────────────────┐
   │  User Sees Error │
   │  in UI           │
   └──────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────┘

Production Server:
   ┌─────────────────────────────────────────────────┐
   │              server.js (Main Process)           │
   │                                                 │
   │  ┌───────────────────┐    ┌─────────────────┐  │
   │  │   Web Server      │    │  Worker Process │  │
   │  │ (React Router)    │    │  (worker.js)    │  │
   │  │                   │    │                 │  │
   │  │ - Handles HTTP    │    │ - Polls DB      │  │
   │  │ - Serves UI       │    │ - Processes Jobs│  │
   │  │ - Creates Jobs    │    │ - Updates Status│  │
   │  └─────────┬─────────┘    └────────┬────────┘  │
   │            │                       │            │
   └────────────┼───────────────────────┼────────────┘
                │                       │
                └───────────┬───────────┘
                            ▼
                    ┌──────────────┐
                    │  PostgreSQL  │
                    │   Database   │
                    └──────────────┘
```

## Key Benefits

### Speed
- User uploads complete in **< 2 seconds**
- Background processing doesn't block user

### Reliability
- Jobs persist in database
- Can retry failed jobs
- System continues even if user disconnects

### Scalability
- Can run multiple workers
- Processes jobs sequentially or in parallel
- Database queue handles high load

### User Experience
- Instant feedback
- Real-time progress
- Clear error messages
- Can use app during upload
