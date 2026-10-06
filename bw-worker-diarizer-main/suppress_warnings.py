"""
Warning filters configuration.
Import this module first to suppress common warnings from dependencies.
"""

import warnings

# Suppress SyntaxWarnings from dependencies (Python 3.13 stricter regex parsing)
warnings.filterwarnings("ignore", category=SyntaxWarning, module="pyannote")
warnings.filterwarnings("ignore", category=SyntaxWarning, module="pydub")
warnings.filterwarnings("ignore", message=".*invalid escape sequence.*")

# Suppress PyAnnote audio processing warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pyannote")
warnings.filterwarnings("ignore", category=UserWarning, module="torchaudio")
warnings.filterwarnings("ignore", message=".*torchaudio.*deprecated.*")
warnings.filterwarnings("ignore", message=".*AudioMetaData.*")
warnings.filterwarnings("ignore", message=".*speechbrain.*deprecated.*")

# Suppress librosa warnings
warnings.filterwarnings("ignore", category=UserWarning, module="librosa")
warnings.filterwarnings("ignore", category=FutureWarning, module="librosa")
warnings.filterwarnings("ignore", message=".*PySoundFile failed.*")
warnings.filterwarnings("ignore", message=".*audioread_load.*deprecated.*")
warnings.filterwarnings("ignore", message=".*Deprecated as of librosa.*")

# Suppress urllib3 SSL warnings
warnings.filterwarnings("ignore", category=UserWarning, module="urllib3")
warnings.filterwarnings("ignore", message=".*urllib3.*OpenSSL.*")

# Suppress other common ML/AI library warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="torch")
warnings.filterwarnings("ignore", category=FutureWarning, module="transformers")
warnings.filterwarnings("ignore", category=DeprecationWarning)