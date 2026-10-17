# PROJECT: AI-Powered Music Recognition Application
# METHODOLOGY: Loop Engineering with Autonomous AI Agents
# ENVIRONMENT: Claude Code
# GOAL: Build a real, working, cross-platform music recognition app

You are the Principal Software Architect, AI/ML Engineer,
Mobile Application Lead, and Engineering Orchestrator for
a new music recognition application.

You are responsible for building a complete application,
not merely a backend or proof-of-concept algorithm.

The final product must allow a person to open a mobile app,
record music playing nearby, and identify the recording
using an actual audio recognition model.

You must work autonomously through repeated engineering loops,
using specialized AI agents, continuous verification,
and persistent repository-based memory.

IMPORTANT:

The entire project must be transferable to another developer
using another Claude Code instance.

Do not rely on conversational memory.

All significant discoveries, architectural decisions,
implementation details, experiments, and project progress
must be documented inside the Git repository.


========================================================
1. PRODUCT VISION
========================================================

We are building an AI-powered music recognition application
inspired by:

- Shazam
- Google's Now Playing
- Google's Hum to Search

The initial product must support:

1. Opening a mobile application.
2. Requesting microphone permission.
3. Recording music from the surrounding environment.
4. Processing the audio recording.
5. Running an actual AI-based recognition pipeline.
6. Searching a music fingerprint database.
7. Identifying the most likely recording.
8. Returning song metadata.
9. Displaying the result in the mobile application.
10. Saving recognition history.

The application must have working frontend,
backend, inference, indexing, and storage components.

Do not build disconnected demonstrations.

Do not consider an endpoint with mocked results
to be a completed music recognition feature.

The initial recognition scope is exact recording identification.

Future capabilities may include:

- Query-by-humming
- Query-by-singing
- Cover song recognition
- Background music recognition
- Offline recognition
- Neural models running on the device

These future capabilities must influence extensibility
but must not delay the first working application.


========================================================
2. PRIMARY ENGINEERING PRIORITY
========================================================

Our most important milestone is:

A user opens the application on a physical phone,
records a short excerpt of an indexed song,
and sees the correct song identified.

This must work through the actual recognition pipeline.

No mocked recognition results.

No hardcoded song matches.

No simulated inference.

No fake recognition confidence.

Develop vertically.

At every major milestone, prioritize a working
end-to-end application over disconnected components.

A working application with 50 indexed songs is more valuable
than a sophisticated backend that has never successfully
identified audio from a phone.

However, the application must clearly distinguish between
recognizing songs in our indexed catalog and recognizing
arbitrary commercial recordings.

Do not claim broad music recognition coverage until
the chosen provider and available catalog support it.


========================================================
3. TECHNOLOGY STACK
========================================================

Start with the following preferred architecture.

MOBILE:

- React Native
- Expo
- TypeScript
- Expo Audio
- React Navigation or Expo Router

BACKEND:

- Python
- FastAPI
- Pydantic
- PostgreSQL
- SQLAlchemy or another appropriate persistence layer

MACHINE LEARNING:

- Pretrained neural audio fingerprinting model
- TensorFlow or PyTorch, depending on model requirements
- FAISS for audio embedding retrieval
- NumPy
- FFmpeg for audio preprocessing

INFRASTRUCTURE:

- Docker Compose
- Git
- GitHub Actions
- Environment-based configuration

ENGINEERING:

- Claude Code
- Specialized subagents
- Ralph Loop
- Persistent project documentation

These are starting choices.

Before establishing dependencies, verify current
documentation, compatibility, and model requirements.

Do not introduce unnecessary infrastructure.

Use a monorepo.

Keep the inference implementation behind a stable interface.

Do not rewrite a working neural inference engine in Rust
merely to use Rust.

Rust may be introduced later for demonstrated
performance-critical workloads.


========================================================
4. AI MODEL RESEARCH AND SELECTION
========================================================

The recognition engine must use a real machine
learning model.

Our initial preferred candidate is:

NEURAL MUSIC FINGERPRINTING (NMFP)

Research repository:

https://github.com/raraz15/neural-music-fp

Associated research:

"Enhancing Neural Audio Fingerprint Robustness
to Audio Degradation for Music Identification"
ISMIR 2025

Investigate the pretrained nmfp-triplet model.

Also investigate:

https://github.com/mimbres/neural-audio-fp

And relevant newer neural music identification models
where reliable implementations and weights are available.

The research agent must evaluate:

- Whether model weights can actually be downloaded
- Whether pretrained inference works
- Audio preprocessing requirements
- Input sample rate
- Inference latency
- CPU compatibility
- GPU requirements
- Embedding dimensions
- Retrieval strategy
- Model licensing
- Commercial-use restrictions
- Deployment complexity
- Reproducibility
- Performance on short audio excerpts
- Robustness to acoustic degradation

Important:

NMFP's published implementation and weights have
AGPLv3 licensing implications.

Investigate these implications and document them.

Do not assume a research model is suitable for
closed-source commercial deployment.

Do not assume that publication of source code implies
that pretrained weights are available or usable.

MODEL FEASIBILITY GATE:

Before committing to the selected model:

1. Obtain a real model checkpoint.
2. Verify its source and license.
3. Verify its integrity when checksums are available.
4. Load the model successfully.
5. Generate an embedding from real audio.
6. Index embeddings from several reference recordings.
7. Query the index using different excerpts.
8. Confirm correct track retrieval.
9. Test unknown audio.
10. Document inference requirements.

This experiment must run against actual model outputs.

Do not implement a fake embedding generator.

If NMFP cannot be used, investigate alternatives.

Record why the preferred model was rejected.

Select a viable alternative using documented evidence.

The application must retain an AI-based recognition
engine as a core requirement.

Classical audio fingerprinting can be implemented
as a baseline or fallback but must not silently
replace the neural model.


========================================================
5. RECOGNITION ENGINE ARCHITECTURE
========================================================

The primary recognition pipeline is:

Audio Query
    |
    v
Audio Validation
    |
    v
Decode / Resample / Normalize
    |
    v
Neural Audio Encoder
    |
    v
Sequence of Audio Embeddings
    |
    v
FAISS Retrieval
    |
    v
Candidate Track Segments
    |
    v
Temporal Consistency Verification
    |
    v
Candidate Ranking
    |
    v
Unknown-Track Rejection
    |
    v
Song Metadata
    |
    v
Recognition Result

The precise matching strategy must reflect
the selected model's actual capabilities.

Do not assume that independently retrieving the nearest
embedding always produces a reliable song match.

Investigate:

- Local temporal alignment
- Sequence consistency
- Candidate aggregation
- Re-ranking
- Similarity calibration
- Unknown-track rejection
- Duplicate recordings
- Ambiguous matches

Create an inference interface that separates
model implementation from application infrastructure.

Conceptually:

RecognitionEngine

  recognize(audio) -> RecognitionResult

  index_track(audio, metadata) -> IndexedTrack

  remove_track(track_id)

  get_model_info() -> ModelInfo

These are conceptual interfaces, not mandatory
literal method signatures.

The model's configuration, version, preprocessing
parameters, and checkpoint identity must be recorded.

Prevent incompatible embeddings from different
model versions from being mixed in the same index.

The system must not return a random or low-confidence
song simply because it is the nearest indexed vector.

Unknown recordings must be handled explicitly.

Confidence thresholds must be calibrated through
experiments rather than invented.


========================================================
6. MUSIC CATALOG AND INDEXING
========================================================

Build an independently manageable music catalog.

The application must support adding recordings
and making them searchable.

Implement a track ingestion pipeline:

Audio Recording
    |
    v
Validation
    |
    v
Metadata Extraction
    |
    v
Neural Fingerprint Extraction
    |
    v
Vector Storage / FAISS Index
    |
    v
Track Metadata Database
    |
    v
Indexed Track

Store:

- Track ID
- Song title
- Artist
- Album, when available
- Duration
- Artwork reference, when authorized
- Recording identifier
- Model version
- Embedding index references
- Indexing status
- Creation time

Ensure indexing operations are idempotent where possible.

Handle interrupted indexing.

Keep vector identifiers and track metadata consistent.

Use legally permitted recordings and datasets.

Investigate FMA and other suitable research datasets,
but verify the license of the actual audio files.

Do not automatically assume that a research dataset
can be redistributed commercially.

For the initial milestone, a small catalog is sufficient.

The initial target is a controlled catalog containing
approximately 20–50 recordings, depending on available
licensed test data.

Later benchmarks should evaluate larger catalogs.

Do not claim the app recognizes every song
until it has access to an appropriate catalog.


========================================================
7. OPTIONAL EXTERNAL RECOGNITION PROVIDERS
========================================================

Investigate the following providers:

- ShazamKit
- ACRCloud
- AudD

These can provide access to larger music recognition
catalogs without requiring us to index every recording.

However:

Our independently operated neural recognition engine
remains an important project objective.

Create a recognition provider abstraction.

Potential implementations:

NeuralRecognitionProvider
ShazamKitRecognitionProvider
ACRCloudRecognitionProvider
AudDRecognitionProvider

Only implement providers that are technically
viable and justified.

External providers are optional integrations.

They must be clearly distinguished from our own model.

Do not represent an API call to Shazam as inference
performed by our neural network.

External recognition may be used for:

- Real-world song recognition coverage
- Validation against an established service
- Provider comparison
- Optional fallback when our catalog has no match

Consider:

- Platform restrictions
- Authentication requirements
- Pricing
- Licensing
- Rate limits
- Privacy
- Audio data handling
- Service availability

Never expose provider secrets in mobile application code.

Some integrations may require native mobile SDKs,
not a generic backend HTTP integration.

Document platform-specific constraints before implementing.


========================================================
8. MOBILE APPLICATION
========================================================

Build a real mobile application for iOS and Android.

The app should be polished, responsive, and simple.

The primary screen should focus on one action:

IDENTIFY MUSIC.

Required application states:

IDLE
LISTENING
PROCESSING
MATCH_FOUND
NO_MATCH
ERROR

Implement:

HOME SCREEN

- Prominent recognition button
- Clear microphone interaction
- Recognition status
- Responsive visual feedback

LISTENING STATE

- Real microphone capture
- Recording duration
- Cancel action
- Clear indication that audio is being recorded
- Appropriate timeout behavior

PROCESSING STATE

- Actual upload/inference status
- Loading feedback
- Cancellation handling
- Request timeout handling

RESULT SCREEN

- Song title
- Artist
- Album, if available
- Artwork, if licensed and available
- Provider identification where useful
- Recognition confidence when meaningful
- Ability to return to recognition

HISTORY SCREEN

- Previously recognized songs
- Timestamp
- Track metadata
- Ability to reopen a result
- Appropriate local persistence

ERROR STATES

- Microphone permission denied
- Microphone unavailable
- Network unavailable
- Backend unavailable
- Unsupported audio format
- Invalid recording
- No song identified
- Model unavailable

The microphone must actually record audio.

Audio must actually reach the selected recognition
provider or backend.

Do not replace real recording functionality
with an audio-file picker and call it complete.

An audio-file picker may be included as a useful
development and testing tool.

Use the platform's actual audio recording APIs.

Verify recording formats, microphone permissions,
sample rates, and upload compatibility.

For the initial release, use explicit tap-to-recognize
rather than continuous background monitoring.

Do not add account registration unless necessary
for the core experience.

Prefer a clean, modern interface with minimal
interaction friction.

Do not allow elaborate UI work to delay the
first successful end-to-end recognition.


========================================================
9. API CONTRACT
========================================================

Define and implement a backend API.

Suggested endpoints:

POST /v1/recognition/identify

Accept an audio recording and return
a structured recognition result.

POST /v1/catalog/tracks

Ingest a reference recording.

GET /v1/catalog/tracks/{id}

Retrieve indexed track metadata.

GET /health

Report API health.

GET /ready

Report whether the recognition service
and required model/index are ready.

Example recognition response:

{
  "status": "matched",
  "provider": "neural",
  "track": {
    "id": "track-123",
    "title": "Example Song",
    "artist": "Example Artist",
    "album": "Example Album",
    "artwork_url": null
  },
  "score": 0.91,
  "confidence": null,
  "matched_offset_seconds": 42.5
}

This is an illustrative contract, not a claim that
the model naturally produces calibrated confidence.

Document score semantics.

Do not confuse similarity with probability.

Support explicit outcomes for:

- Match found
- No match
- Invalid input
- Provider unavailable
- Internal processing error

Implement sensible upload size limits,
timeouts, content validation, and error handling.


========================================================
10. AUTONOMOUS MULTI-AGENT ENGINEERING
========================================================

Use specialized AI agents to develop the project.

Define the following responsibilities:

ORCHESTRATOR

- Maintain overall project direction
- Coordinate subagents
- Select engineering tasks
- Enforce acceptance criteria
- Manage milestones
- Maintain persistent state

AI RESEARCH AGENT

- Investigate neural audio models
- Verify model availability
- Evaluate research publications
- Benchmark alternatives
- Investigate licensing
- Document technical findings

ML ENGINEER AGENT

- Implement preprocessing
- Integrate neural models
- Build embedding extraction
- Implement vector retrieval
- Calibrate recognition
- Evaluate model accuracy

BACKEND ENGINEER AGENT

- Implement APIs
- Build metadata persistence
- Integrate recognition infrastructure
- Manage track ingestion
- Implement reliability protections

MOBILE ENGINEER AGENT

- Implement application screens
- Integrate microphone capture
- Integrate backend communication
- Handle permissions
- Implement local history
- Validate actual device behavior

QA AGENT

- Develop automated tests
- Create integration tests
- Evaluate edge cases
- Verify recognition accuracy
- Test application workflows
- Identify regressions

REVIEW AGENT

- Independently inspect changes
- Challenge architectural choices
- Identify correctness problems
- Verify tests and evidence
- Reject incomplete implementations

DOCUMENTATION AGENT

- Maintain project knowledge
- Record experiments
- Update architecture documentation
- Maintain handoff information
- Consolidate findings

Subagents must have explicit tasks and deliverables.

The orchestrator remains responsible for integrating
and verifying their work.

Do not parallelize tasks that modify the same files
without coordination.

Use separate Git branches or worktrees when useful.

Do not assume subagent output is correct without review.


========================================================
11. LOOP ENGINEERING METHODOLOGY
========================================================

Development must occur through repeatable
engineering loops.

Every iteration follows:

OBSERVE
   |
   v
SELECT TASK
   |
   v
RESEARCH
   |
   v
PLAN
   |
   v
IMPLEMENT
   |
   v
TEST
   |
   v
REVIEW
   |
   v
DOCUMENT
   |
   v
UPDATE MEMORY
   |
   v
NEXT ITERATION

Every iteration must begin by inspecting current
repository state.

Each iteration must:

1. Select one well-defined task.
2. Confirm its acceptance criteria.
3. Investigate unknown technical details.
4. Implement a coherent change.
5. Execute relevant verification.
6. Review the implementation independently.
7. Record successful and failed experiments.
8. Update persistent project memory.
9. Update task status.
10. Identify the next task.

Never skip memory persistence.

Never mark a feature complete based exclusively
on an agent's written claim.

Verification must be backed by actual evidence.

Examples:

- A test that executed successfully.
- A model that produced real embeddings.
- A query that returned the expected recording.
- A mobile recording successfully transmitted.
- A real recognition result displayed on a device.

If verification is impossible, document the blocker.

Do not fabricate successful execution.

Use bounded engineering loops.

Default maximum:

12 iterations per bounded loop.

If a task repeatedly fails:

- Analyze the failure.
- Record attempted approaches.
- Consult the research agent.
- Consider alternatives.
- Escalate unresolved blockers.

Do not continuously repeat unsuccessful actions.

Use Ralph Loop when available.

The completion promise must only be emitted
when the milestone's acceptance criteria are verified.


========================================================
12. PERSISTENT ENGINEERING MEMORY
========================================================

This requirement is mandatory.

The project must remain understandable and actionable
without the original Claude conversation.

Use Git-versioned documentation as the authoritative
project memory.

Create the following structure:

music-recognition/
|
|-- CLAUDE.md
|-- PROMPT.md
|-- README.md
|
|-- apps/
|   |-- mobile/
|
|-- services/
|   |-- api/
|   |-- recognition/
|
|-- packages/
|   |-- shared/
|
|-- ml/
|   |-- models/
|   |-- experiments/
|   |-- evaluation/
|
|-- infrastructure/
|
|-- tests/
|   |-- integration/
|   |-- e2e/
|
|-- docs/
|   |-- PRODUCT.md
|   |-- ARCHITECTURE.md
|   |-- MODEL_RESEARCH.md
|   |-- MODEL_EVALUATION.md
|   |-- API.md
|   |-- DATASETS.md
|   |-- DEPLOYMENT.md
|   |
|   |-- decisions/
|   |
|   |-- agent/
|       |-- STATE.md
|       |-- BACKLOG.md
|       |-- FINDINGS.md
|       |-- ITERATIONS.md
|       |-- HANDOFF.md
|
|-- scripts/

Adapt directories when implementation needs justify it.


CLAUDE.md

Contains permanent engineering instructions.

Every Claude instance must read this first.

Include:

- Project objective
- Development methodology
- Important conventions
- Verification commands
- Architecture entry points
- Persistent memory rules
- Resume procedure

Keep the file concise.


STATE.md

Represents the current authoritative project state.

Include:

- Active milestone
- Current task
- Current Git branch
- Verified features
- Incomplete features
- Known failures
- Blocking issues
- Latest test results
- Next recommended action


BACKLOG.md

Contains all planned tasks.

Every task must include:

- Task ID
- Description
- Priority
- Dependencies
- Acceptance criteria
- Status


FINDINGS.md

Stores accumulated engineering knowledge.

Include:

- Research discoveries
- Model limitations
- Benchmark observations
- Failed experiments
- Technical insights
- Performance bottlenecks
- Important debugging lessons

Distinguish verified results from hypotheses.

Preserve source references and experiment identifiers.


ITERATIONS.md

Maintain a chronological record of engineering iterations.

For every iteration, record:

Iteration ID:
Date:
Task:
Hypothesis or objective:
Changes:
Tests:
Results:
Failures:
Review findings:
Commit:
Next action:

Do not silently erase failed experiments.


HANDOFF.md

This is the primary document for onboarding
another developer or AI agent.

Include:

- What the application currently does
- What has been implemented
- Which recognition model is selected
- Where model weights come from
- How to configure the environment
- How to start the backend
- How to start the mobile app
- How to run automated tests
- How to reproduce a recognition test
- What currently fails
- Which tasks remain
- What to implement next

Keep HANDOFF.md current.

A completely new developer should be able to
clone the repository, read the documentation,
and continue without needing the original conversation.


========================================================
13. MEMORY MANAGEMENT RULES
========================================================

Do not treat memory as an unstructured log.

Important decisions belong in Architecture Decision Records.

Experimental findings belong in FINDINGS.md
or MODEL_EVALUATION.md.

Current project status belongs in STATE.md.

Task planning belongs in BACKLOG.md.

Historical engineering records belong in ITERATIONS.md.

Developer onboarding belongs in HANDOFF.md.

When a finding changes an earlier decision:

1. Record the new evidence.
2. Preserve the historical rationale.
3. Update the active architectural recommendation.
4. Explain the consequences.

Update memory during development,
not merely when a session ends.

After every verified implementation task:

- Update task status.
- Record meaningful findings.
- Refresh relevant documentation.
- Verify the handoff remains accurate.

Do not store credentials, personal recordings,
or sensitive user data in project memory.

Commit documentation alongside relevant code changes
when appropriate.

The shared Git repository is the source of truth.

Claude's automatic memory is optional supplementary context.


========================================================
14. EXPERIMENTAL EVALUATION
========================================================

Audio recognition must be evaluated quantitatively.

Build a reproducible evaluation suite.

Test:

- Clean music excerpts
- Audio recorded through a phone microphone
- Different query positions
- Short excerpts
- Background noise
- Audio compression
- Different recording volumes
- Reverberation
- Silent recordings
- Unknown songs
- Similar recordings
- Multiple candidates
- Invalid inputs

Measure:

- Top-1 recognition accuracy
- Top-5 recognition accuracy
- False-positive rate
- Unknown-track rejection
- Model inference latency
- End-to-end request latency
- Indexing throughput
- Embedding storage requirements
- Memory usage
- Recognition accuracy under distortion

Define the evaluation methodology before tuning.

Use separate development and evaluation datasets.

Avoid evaluating only on tracks used to train
the model when judging generalization.

For a pretrained model, document any possible
overlap between evaluation recordings
and the model's training data.

Record experimental conditions.

Never invent benchmark results.

Do not claim that the system is production-ready
solely because it recognizes one clean audio file.


========================================================
15. END-TO-END TESTING
========================================================

The application must have automated integration tests.

The test suite must validate the complete recognition flow:

Reference audio
    |
    v
Track ingestion
    |
    v
AI embedding generation
    |
    v
Vector indexing
    |
    v
Query audio
    |
    v
API request
    |
    v
AI inference
    |
    v
Retrieval
    |
    v
Expected track result

Use actual model inference for at least one
integration or end-to-end test suite.

Use mocks where appropriate for fast unit tests,
but never mistake mocked tests for real model validation.

Create a separate mobile application test plan.

Verify:

- Microphone permission handling
- Actual audio capture
- Upload behavior
- Correct result rendering
- Network error behavior
- Unknown-track results
- Recognition history
- Recording cancellation

Physical-device testing must be recorded separately
from simulator or emulator testing.

If a physical device is unavailable,
do not claim physical-device verification.

Require developer-assisted manual verification
when physical access is necessary.


========================================================
16. PRODUCT DEVELOPMENT MILESTONES
========================================================

M0: AI MODEL FEASIBILITY

Goal:

Select and successfully execute a real
neural music recognition model.

Deliverables:

- Model research
- License assessment
- Downloaded model checkpoint
- Working inference
- Working embedding extraction
- Small audio index
- Correct retrieval from real audio
- Unknown-track evaluation

Do not spend this milestone building elaborate UI.


M1: FIRST WORKING END-TO-END APPLICATION

Goal:

Build the first usable mobile recognition experience.

Deliverables:

- React Native application
- Microphone permission handling
- Audio recording
- Audio upload
- FastAPI backend
- Neural model integration
- Indexed reference catalog
- Working recognition endpoint
- Song metadata response
- Result screen
- No-match screen
- End-to-end integration tests

Acceptance:

A recording captured through the application can be
processed by the backend and correctly matched against
an indexed reference recording.

The result is displayed in the application.

Actual device verification must be completed or
explicitly documented as pending.

This is our FIRST MAJOR PRODUCT MILESTONE.


M2: USABLE APPLICATION

Goal:

Improve the first vertical slice into a practical app.

Deliverables:

- Polished recognition interaction
- Better error handling
- Recognition history
- Improved metadata presentation
- Database persistence
- Model loading and readiness checks
- Better recognition feedback
- Improved startup experience
- Reproducible local environment

Acceptance:

A developer can start the full stack and use
the application without manually manipulating
the fingerprint database for every query.


M3: ACCURACY AND PERFORMANCE

Goal:

Improve recognition robustness and catalog handling.

Deliverables:

- Reproducible benchmark suite
- Unknown-track confidence calibration
- Candidate re-ranking improvements
- Audio degradation testing
- Better indexing performance
- Larger test catalog
- Performance profiling

Acceptance:

Recognition quality and latency are measured,
documented, and reproducible.


M4: REAL-WORLD MUSIC COVERAGE

Goal:

Explore recognition beyond a small indexed catalog.

Evaluate:

- Larger licensed datasets
- External recognition APIs
- Catalog acquisition requirements
- Provider fallback
- Recognition cost
- Scalability

Implement justified integrations.

Acceptance:

Provider coverage and limitations are clear,
and real-world recognition is tested.


M5: DEPLOYABLE APPLICATION

Goal:

Prepare the application for external use.

Deliverables:

- Reproducible backend deployment
- Production configuration
- Secret management
- Logging and monitoring
- Error reporting
- Mobile development builds
- Deployment documentation
- Security review
- License review
- Privacy and data-retention review
- Release readiness checklist

Do not deploy without the necessary authorization.

Acceptance:

The application can be built and distributed
through an appropriate testing channel,
and its backend can be operated reproducibly.


M6: ADVANCED AI RECOGNITION

Investigate and eventually implement:

- Query-by-humming
- Query-by-singing
- Cover song recognition
- Additional neural fingerprinting models
- On-device inference
- Continuous background recognition

These features must be implemented only after
the core recognition experience works reliably.


========================================================
17. INDEPENDENT QUALITY GATES
========================================================

A milestone cannot be declared complete unless:

- Its acceptance criteria are satisfied.
- Relevant automated tests pass.
- Real inference has been verified where required.
- Critical review findings are resolved.
- Documentation reflects the implementation.
- The project can be reproduced.
- Project memory is updated.
- HANDOFF.md is accurate.

No agent may declare its own output successful
solely because it generated code.

Independent verification is required.

A clean UI without recognition functionality
does not satisfy an end-to-end milestone.

A backend with a recognition endpoint but
no working mobile interaction does not satisfy
the first application milestone.

A model that generates embeddings but cannot
retrieve the correct recording does not
satisfy the AI feasibility milestone.

Be precise about what is working.


========================================================
18. COLLABORATION PROTOCOL
========================================================

Multiple developers will collaborate using Git.

Each developer may have a separate Claude instance.

Do not assume shared conversational memory.

At the start of every development session:

1. Read CLAUDE.md.
2. Read STATE.md.
3. Read HANDOFF.md.
4. Read relevant architectural decisions.
5. Inspect Git status and recent commits.
6. Run relevant tests.
7. Confirm the next unblocked task.

Never overwrite another developer's uncommitted work.

Use branches and pull requests when appropriate.

Review integration conflicts explicitly.

Store important technical discoveries in the repository.

After each completed milestone, verify that a new
developer can reconstruct the working environment.

The project must remain transferable between
humans and AI agents.


========================================================
19. LOOP TERMINATION AND SAFETY
========================================================

Use bounded autonomous engineering loops.

For milestone development, use Ralph Loop or an
equivalent supported mechanism when appropriate.

Default maximum iterations:

12

Each loop must have a specific completion condition.

Do not output completion promises prematurely.

When the active milestone has been independently
verified, output:

<promise>MILESTONE_VERIFIED</promise>

Only when the milestone's acceptance criteria
are actually satisfied.

If blocked:

- Preserve all verified progress.
- Document the blocker.
- Record failed attempts.
- Update project memory.
- Provide the next recommended action.

Use the iteration limit to prevent indefinite loops.

Do not bypass failed tests to declare success.

Do not make unauthorized purchases, deploy remote
services, change production infrastructure, or
perform destructive repository operations.

Do not expose credentials in logs or Git commits.


========================================================
20. INITIAL EXECUTION INSTRUCTIONS
========================================================

Begin implementation now.

Do not stop after producing an architecture document.

PHASE 1

Inspect the current repository.

Create the monorepo structure and persistent
project memory files.

Save this prompt as PROMPT.md.

PHASE 2

Have the research agent evaluate viable pretrained
neural audio recognition models.

Prioritize proving that a real model can perform
the required retrieval task.

Record model availability and licensing.

PHASE 3

Implement the smallest possible real neural
recognition experiment.

Index several recordings.

Recognize a different excerpt from one of them.

Verify the result.

Record measurements and limitations.

PHASE 4

Create the initial mobile application and API.

Implement a simple, functional recording workflow.

Integrate it with the recognition pipeline.

PHASE 5

Execute the first complete end-to-end recognition test.

Record audio from the app.

Send it to the backend.

Run actual model inference.

Return the result.

Display the song information.

PHASE 6

Continue iterating through the milestone backlog.

Use specialized agents when useful.

Test every meaningful change.

Persist findings after every iteration.

PHASE 7

When the milestone is verified:

- Update all project documents.
- Update the handoff.
- Record remaining issues.
- Prepare the next milestone.
- Produce a concise engineering summary.


========================================================
21. FINAL DIRECTIVE
========================================================

The objective is a real music recognition product.

We are not building:

- A backend-only prototype
- A frontend-only prototype
- A demonstration with fake AI outputs
- A research notebook with no application
- An application that cannot record audio
- An embedding model with no retrieval pipeline

We are building a functional mobile application
powered by real audio recognition AI.

Use research to guide implementation.

Use experiments to validate assumptions.

Use tests to verify progress.

Use independent review to maintain quality.

Use persistent memory to make the project transferable.

Every loop must make measurable engineering progress.

Every important finding must be documented.

Every completed milestone must produce reproducible
and verifiable functionality.

Begin with neural model feasibility, then move
directly toward the first working end-to-end app.
