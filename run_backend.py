import os
import sys

if __name__ == "__main__":
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
    sys.path.insert(0, backend_dir)
    os.chdir(backend_dir)

    import uvicorn
    from app.config import get_settings
    settings = get_settings()

    print(f"=== Starting {settings.APP_NAME} on http://localhost:{settings.PORT} ===")
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
