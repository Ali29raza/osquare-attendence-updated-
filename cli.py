import argparse
import os
import sys
from converter import AttendanceDataStore

def main():
    parser = argparse.ArgumentParser(
        description="Convert Aptech Student Attendance Report to Osquare attendanceImport.csv format"
    )
    parser.add_argument("-f", "--file", default="StudentAttendanceReport.xlsx", help="Path to Excel attendance report")
    parser.add_argument("-b", "--batch", required=False, help="Batch name to filter (e.g. AI-202408B1+08B)")
    parser.add_argument("-s", "--students", nargs="*", help="Specific student IDs (e.g. 1595445 1601621)")
    parser.add_argument("-o", "--output", help="Output CSV filepath (default: attendanceImport_<batch>.csv)")
    parser.add_argument("--list-batches", action="store_true", help="List all available batches in the report")
    parser.add_argument("--list-students", action="store_true", help="List students in specified batch")
    parser.add_argument("--no-dedup", action="store_true", help="Do not deduplicate multiple sessions on the same date")
    parser.add_argument(
        "-i", "--id-format",
        default="Student",
        help="Student ID format: 'Student' (Student1730705), 'numeric' (1730705), 'ID' (ID1730705), or 'custom' (with -p/--custom-prefix). Default: Student"
    )
    parser.add_argument(
        "-p", "--custom-prefix",
        default="",
        help="Custom prefix when using custom Student ID format (e.g. STD, AP-, STU-)"
    )

    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"Error: Excel file '{args.file}' not found.")
        sys.exit(1)

    print(f"Loading data from '{args.file}'...")
    ds = AttendanceDataStore(excel_path=args.file)
    ds.load_data()

    if args.list_batches:
        batches = ds.get_batches_summary()
        print(f"\nFound {len(batches)} Batches:")
        print(f"{'Batch Name':<35} | {'Students':<10} | {'Dates':<8} | Course Code")
        print("-" * 75)
        for b in batches:
            print(f"{b['batch_name']:<35} | {b['student_count']:<10} | {b['date_count']:<8} | {b['course_code']}")
        return

    if not args.batch:
        print("Error: Please provide a batch name with -b / --batch or list batches with --list-batches.")
        sys.exit(1)

    if args.batch not in ds.batches:
        print(f"Error: Batch '{args.batch}' not found in dataset.")
        print("Available matching batches:")
        matches = [b for b in ds.batches if args.batch.lower() in b.lower()]
        for m in matches[:10]:
            print(f"  - {m}")
        sys.exit(1)

    if args.list_students:
        students = ds.get_students_for_batch(args.batch)
        print(f"\nStudents in Batch '{args.batch}' ({len(students)} total):")
        print(f"{'Student ID':<15} | {'Name':<30} | Attendance Days")
        print("-" * 65)
        for s in students:
            print(f"{s['id']:<15} | {s['name']:<30} | {s['attendance_days']}")
        return

    dedup = not args.no_dedup
    csv_str = ds.export_csv_string(
        batch_name=args.batch,
        student_ids=args.students,
        deduplicate_dates=dedup,
        id_format=args.id_format,
        custom_prefix=args.custom_prefix
    )

    out_file = args.output
    if not out_file:
        out_file = ds.get_export_filename(args.batch, args.students)

    with open(out_file, "w", encoding="utf-8", newline="") as f:
        f.write(csv_str)

    rows_count = len(csv_str.strip().split("\n")) - 1
    print(f"\n[Success] Exported {rows_count} attendance records to '{out_file}' successfully!")

if __name__ == "__main__":
    main()
