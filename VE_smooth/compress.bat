setlocal enabledelayedexpansion

for /r "C:\Users\abaha\OneDrive\Documents\Map\Therapy_cave" %%i in (*.png) do (
    set "output_folder=%%~dpi"
    set "output_folder=!output_folder:~0,-1!"
    magick convert "%%i" -quality 70 "!output_folder!\%%~ni.jpg"
)
