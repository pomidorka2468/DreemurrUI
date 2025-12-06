# Dreemurr UI

A web-based user interface for a local AI character chat application. This project uses a Python FastAPI backend to serve the application and manage data, and a vanilla HTML, CSS, and JavaScript frontend for the user interface.

## Features

- **Character Management:** Create, view, and manage AI characters.
- **Chat Interface:** Real-time chat with selected characters.
- **Notebook:** A space for keeping notes and logs.
- **Theming:** Supports multiple color themes (e.g., Cream, Inkwell, Stardust, Void).
- **Model Selection:** UI components for choosing different AI models.

## Technology Stack

- **Backend:**
  - Python 3
  - FastAPI (for the API)
  - Uvicorn (as the ASGI server)
  - SQLite (for the database `app.db`)

- **Frontend:**
  - HTML5
  - CSS3
  - JavaScript

## File Structure

- `index.html`: The main entry point of the application.
- `app.db`: The SQLite database file.
- `static/`: Contains all static assets.
  - `css/`: Stylesheets for different parts of the UI and themes.
  - `icons/`: SVG icons used throughout the application.
  - `inc/`: HTML partials that are likely included in the main page.
  - `js/`: JavaScript files for frontend logic.
  - `lib/`: The Python source code for the FastAPI backend.
    - `main.py`: The main file for the FastAPI application.
  - `userdata/`: User-specific data, such as configuration and character information.
- `venv/`: Python virtual environment.

## How to Run the Application

1. **Activate the Virtual Environment:**
   Open your terminal in the project root and run:
   ```sh
   .\venv\Scripts\activate
   ```

2. **Run the Backend Server:**
   Once the virtual environment is active, start the FastAPI server using uvicorn:
   ```sh
   python -m uvicorn static.lib.main:app --reload
   ```
   The `--reload` flag will automatically restart the server when you make changes to the code.

3. **Access the Application:**
   Open your web browser and navigate to:
   [http://127.0.0.1:8000](http://127.0.0.1:8000)

The Dreemurr UI should now be running in your browser.
