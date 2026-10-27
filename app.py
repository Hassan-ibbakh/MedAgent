"""Vercel entrypoint for the MedAgent FastAPI application."""

from backend.app.main import app

__all__ = ["app"]
