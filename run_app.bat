@echo off
title Aptech Osquare Attendance Converter
echo ========================================================
echo   Aptech to Osquare Attendance Converter & Exporter
echo ========================================================
echo.
echo Starting application server...
start http://127.0.0.1:5000
python app.py
pause
