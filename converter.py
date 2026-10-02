import os
import re
import csv
import io
import pickle
import openpyxl
from datetime import datetime
from typing import Dict, List, Any, Optional

def clean_student_id(s_id: Any, strip_prefix: bool = True) -> str:
    """Extract clean student ID as numbers or trimmed string."""
    if s_id is None:
        return ""
    s_id_str = str(s_id).strip()
    if strip_prefix:
        match = re.search(r'\d+', s_id_str)
        if match:
            return match.group(0)
    return s_id_str

def format_student_id(s_id: Any, id_format: str = "Student", custom_prefix: str = "") -> str:
    """
    Format student ID based on selected format option:
    1: 'Student' -> e.g. Student1730705
    2: 'numeric' -> e.g. 1730705
    3: 'ID'      -> e.g. ID1730705
    4: 'custom'  -> e.g. <custom_prefix>1730705
    """
    clean = clean_student_id(s_id, strip_prefix=True)
    if not clean:
        return ""
    
    fmt = str(id_format).strip()
    fmt_lower = fmt.lower()

    if fmt_lower in ("numeric", "raw", "none", "{id}", "1730705", "clean", "2"):
        return clean
    elif fmt_lower in ("id", "id{id}", "id1730705", "prefix_id", "3"):
        return f"ID{clean}"
    elif fmt_lower in ("student", "student{id}", "student1730705", "prefix_student", "1"):
        return f"Student{clean}"
    elif fmt_lower == "custom" or custom_prefix:
        prefix = custom_prefix if custom_prefix is not None else ""
        return f"{prefix}{clean}"
    elif fmt_lower.startswith("custom:"):
        prefix = fmt.split(":", 1)[1]
        return f"{prefix}{clean}"
    else:
        # If user passed custom string directly
        return f"{fmt}{clean}"

def format_date_to_target(date_val: Any) -> Optional[str]:
    """
    Converts DD/MM/YYYY or datetime to MM/DD/YYYY format.
    Example: 01/07/2026 -> 07/01/2026
    """
    if date_val is None:
        return None
    if isinstance(date_val, datetime):
        return date_val.strftime("%m/%d/%Y")
    
    date_str = str(date_val).strip()
    # Try parsing standard formats
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%m/%d/%Y")
        except ValueError:
            pass
            
    # Fallback regex parsing if string looks like DD/MM/YYYY
    parts = re.split(r'[/.-]', date_str)
    if len(parts) == 3:
        d, m, y = parts[0].zfill(2), parts[1].zfill(2), parts[2]
        if len(y) == 2:
            y = "20" + y
        return f"{m}/{d}/{y}"
    return date_str

def sanitize_filename_part(text: str) -> str:
    """Sanitize text to be safe for filenames, replacing spaces and invalid characters."""
    if not text:
        return ""
    # Strip whitespace and trailing dots
    cleaned = text.strip().rstrip('.')
    # Replace spaces and multiple underscores with a single underscore
    cleaned = re.sub(r'[\s]+', '_', cleaned)
    # Remove characters that are unsafe for filenames
    cleaned = re.sub(r'[^a-zA-Z0-9_\-]', '', cleaned)
    # Collapse multiple underscores
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')
    return cleaned

def matches_date_filter(dt: str, date_filter: Any) -> bool:
    """Check if date matches date_filter which can be a search string or list/set of dates."""
    if not date_filter:
        return True
    if isinstance(date_filter, str):
        query = date_filter.strip().lower()
        if not query:
            return True
        return query in dt.lower()
    if isinstance(date_filter, (list, set, tuple)):
        for item in date_filter:
            if not item:
                continue
            item_str = str(item).strip().lower()
            if item_str == dt.lower() or item_str in dt.lower():
                return True
        return False
    return True

class AttendanceDataStore:
    def __init__(self, excel_path: Optional[str] = None, cache_path: Optional[str] = None):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.excel_path = excel_path or os.path.join(base_dir, "StudentAttendanceReport.xlsx")
        self.cache_path = cache_path or os.path.join(base_dir, ".attendance_cache.pkl")
        self.batches: Dict[str, Dict[str, Any]] = {}
        self.is_loaded = False
        self.total_rows = 0
        self.last_loaded_mtime = 0

    def load_data(self, force_reload: bool = False) -> bool:
        if not os.path.exists(self.excel_path):
            return False

        current_mtime = os.path.getmtime(self.excel_path)

        if self.is_loaded and not force_reload and current_mtime == self.last_loaded_mtime:
            return True

        # Check disk cache first
        if not force_reload and os.path.exists(self.cache_path):
            try:
                with open(self.cache_path, "rb") as f:
                    cache_data = pickle.load(f)
                    if cache_data.get("mtime") == current_mtime:
                        self.batches = cache_data.get("batches", {})
                        self.total_rows = cache_data.get("total_rows", 0)
                        self.last_loaded_mtime = current_mtime
                        self.is_loaded = True
                        print(f"Loaded {len(self.batches)} batches from cache instantly.")
                        return True
            except Exception as ex:
                print(f"Cache load error: {ex}, falling back to Excel parse.")

        print(f"Parsing '{self.excel_path}'...")
        wb = openpyxl.load_workbook(self.excel_path, read_only=True)
        ws = wb.active
        self.batches = {}
        row_count = 0

        for r_idx, row in enumerate(ws.iter_rows(values_only=True)):
            if r_idx < 8 or not row or len(row) < 14:
                continue
            
            s_id_raw = row[9]
            s_name = row[10]
            att_date_raw = row[12]
            batch_name = row[13]

            if s_id_raw is None or batch_name is None or att_date_raw is None:
                continue

            batch_key = str(batch_name).strip()
            student_clean = clean_student_id(s_id_raw, strip_prefix=True)
            formatted_date = format_date_to_target(att_date_raw)

            if not formatted_date or not student_clean:
                continue

            row_count += 1
            if batch_key not in self.batches:
                self.batches[batch_key] = {
                    'name': batch_key,
                    'students': {},
                    'dates': set(),
                    'course_code': str(row[14]).strip() if len(row) > 14 and row[14] else ""
                }

            batch_obj = self.batches[batch_key]
            batch_obj['dates'].add(formatted_date)

            if student_clean not in batch_obj['students']:
                batch_obj['students'][student_clean] = {
                    'id': student_clean,
                    'raw_id': str(s_id_raw).strip(),
                    'name': str(s_name).strip() if s_name else "Unknown",
                    'dates': set(),
                    'raw_dates': set(),
                    'records': []
                }

            student_obj = batch_obj['students'][student_clean]
            student_obj['dates'].add(formatted_date)
            student_obj['raw_dates'].add(str(att_date_raw).strip())
            student_obj['records'].append({
                'date': formatted_date,
                'raw_date': str(att_date_raw).strip(),
                'session': str(row[20]).strip() if len(row) > 20 and row[20] else ""
            })

        wb.close()
        self.total_rows = row_count
        self.last_loaded_mtime = current_mtime
        self.is_loaded = True

        # Save to disk cache for instant subsequent loading
        try:
            with open(self.cache_path, "wb") as f:
                pickle.dump({
                    "mtime": current_mtime,
                    "batches": self.batches,
                    "total_rows": self.total_rows
                }, f)
            print(f"Cached {len(self.batches)} batches to {self.cache_path}.")
        except Exception as ex:
            print(f"Failed to write cache: {ex}")

        return True

    def get_batches_summary(self) -> List[Dict[str, Any]]:
        if not self.is_loaded:
            self.load_data()
        
        result = []
        for batch_name in sorted(self.batches.keys()):
            b = self.batches[batch_name]
            result.append({
                'batch_name': batch_name,
                'student_count': len(b['students']),
                'date_count': len(b['dates']),
                'course_code': b['course_code']
            })
        return result

    def get_students_for_batch(self, batch_name: str) -> List[Dict[str, Any]]:
        if not self.is_loaded:
            self.load_data()
        
        if batch_name not in self.batches:
            return []
        
        batch = self.batches[batch_name]
        students = []
        for sid, sdata in sorted(batch['students'].items(), key=lambda x: x[1]['name']):
            students.append({
                'id': sid,
                'raw_id': sdata['raw_id'],
                'name': sdata['name'],
                'attendance_days': len(sdata['dates']),
                'dates': sorted(list(sdata['dates']))
            })
        return students

    def get_batch_dates(self, batch_name: str) -> List[str]:
        if not self.is_loaded:
            self.load_data()
        if batch_name not in self.batches:
            return []
        return sorted(list(self.batches[batch_name]['dates']))

    def generate_attendance_rows(
        self,
        batch_name: str,
        student_ids: Optional[List[str]] = None,
        date_filter: Optional[Any] = None,
        deduplicate_dates: bool = True,
        id_format: str = "Student",
        custom_prefix: str = ""
    ) -> List[Dict[str, str]]:
        if not self.is_loaded:
            self.load_data()

        if batch_name not in self.batches:
            return []

        batch = self.batches[batch_name]
        rows = []
        target_students = student_ids if student_ids else list(batch['students'].keys())

        for sid in target_students:
            if sid not in batch['students']:
                continue
            student = batch['students'][sid]
            formatted_sid = format_student_id(sid, id_format=id_format, custom_prefix=custom_prefix)
            
            if deduplicate_dates:
                sorted_dates = sorted(list(student['dates']))
                for dt in sorted_dates:
                    if not matches_date_filter(dt, date_filter):
                        continue
                    rows.append({
                        'Student ID': formatted_sid,
                        'Date': dt,
                        'Status': 'P'
                    })
            else:
                for rec in student['records']:
                    dt = rec['date']
                    if not matches_date_filter(dt, date_filter):
                        continue
                    rows.append({
                        'Student ID': formatted_sid,
                        'Date': dt,
                        'Status': 'P'
                    })

        return rows

    def get_export_filename(
        self,
        batch_name: str,
        student_ids: Optional[List[str]] = None
    ) -> str:
        safe_batch = sanitize_filename_part(batch_name)
        if not student_ids:
            return f"attendanceImport_{safe_batch}.csv" if safe_batch else "attendanceImport.csv"

        if batch_name in self.batches:
            batch_students = self.batches[batch_name]['students']
            names = []
            for sid in student_ids:
                if sid in batch_students:
                    s_name = batch_students[sid].get('name', sid)
                    clean_name = sanitize_filename_part(s_name)
                    if clean_name:
                        names.append(clean_name)
            
            # If all students in batch are selected, or more than 3 students, use batch filename
            if len(student_ids) == len(batch_students) or len(names) > 3:
                if safe_batch:
                    return f"attendanceImport_{safe_batch}.csv"
                return "attendanceImport.csv"
            
            if names:
                attached_names = "_".join(names)
                if safe_batch:
                    return f"attendanceImport_{safe_batch}_{attached_names}.csv"
                else:
                    return f"attendanceImport_{attached_names}.csv"

        # Fallback if student names not in batch
        safe_ids = "_".join(sanitize_filename_part(sid) for sid in student_ids[:3])
        if safe_batch:
            return f"attendanceImport_{safe_batch}_{safe_ids}.csv"
        return f"attendanceImport_{safe_ids}.csv"

    def export_csv_string(
        self,
        batch_name: str,
        student_ids: Optional[List[str]] = None,
        date_filter: Optional[Any] = None,
        deduplicate_dates: bool = True,
        id_format: str = "Student",
        custom_prefix: str = ""
    ) -> str:
        rows = self.generate_attendance_rows(
            batch_name=batch_name,
            student_ids=student_ids,
            date_filter=date_filter,
            deduplicate_dates=deduplicate_dates,
            id_format=id_format,
            custom_prefix=custom_prefix
        )
        
        output = io.StringIO()
        writer = csv.writer(output, lineterminator='\n')
        writer.writerow(['Student ID', 'Date', 'Status'])
        for r in rows:
            writer.writerow([r['Student ID'], r['Date'], r['Status']])
        
        return output.getvalue()
