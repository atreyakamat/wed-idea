"""The editing engine: reads a photo's light, picks one of 25 looks, applies it.

    from cwp_worker.looks import edit
    result = edit(image)          # PIL image in, EditResult out
    result.image, result.lighting, result.look

Everything runs on the photographer's own computer with Pillow and numpy.
"""

from .engine import EditResult, edit
from .features import Features, measure
from .lighting import LIGHTING_LABELS, Lighting, classify
from .recipes import LOOKS, LOOKS_BY_GROUP, Look, get_look

__all__ = [
    "EditResult",
    "Features",
    "LIGHTING_LABELS",
    "LOOKS",
    "LOOKS_BY_GROUP",
    "Lighting",
    "Look",
    "classify",
    "edit",
    "get_look",
    "measure",
]
