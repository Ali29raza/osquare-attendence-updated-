// Aptech to Osquare Attendance Converter Front-end Engine

document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        batches: [],
        filteredBatches: [],
        currentBatch: null,
        students: [],
        filteredStudents: [],
        selectedStudentIds: new Set(),
        dates: [],
        dateSearch: '',
        deduplicate: true,
        idFormat: 'Student',
        customPrefix: 'STD',
        previewData: null
    };

    // DOM Elements
    const totalBatchesCount = document.getElementById('totalBatchesCount');
    const totalStudentsCount = document.getElementById('totalStudentsCount');
    const batchSearchInput = document.getElementById('batchSearchInput');
    const clearBatchSearch = document.getElementById('clearBatchSearch');
    const batchSelect = document.getElementById('batchSelect');
    const selectedBatchMeta = document.getElementById('selectedBatchMeta');
    const metaCourseCode = document.getElementById('metaCourseCode');
    const metaDateCount = document.getElementById('metaDateCount');
    const metaStudentCount = document.getElementById('metaStudentCount');
    
    const studentSearchInput = document.getElementById('studentSearchInput');
    const studentListContainer = document.getElementById('studentListContainer');
    const selectedCountBadge = document.getElementById('selectedCountBadge');
    const btnSelectAllStudents = document.getElementById('btnSelectAllStudents');
    const btnDeselectAllStudents = document.getElementById('btnDeselectAllStudents');

    const chkDeduplicate = document.getElementById('chkDeduplicate');
    const customPrefixInput = document.getElementById('customPrefixInput');
    const customExampleCode = document.getElementById('customExampleCode');
    const cardCustomPrefix = document.getElementById('cardCustomPrefix');
    const previewRecordCount = document.getElementById('previewRecordCount');
    const previewTableBody = document.getElementById('previewTableBody');
    const rawCsvCode = document.getElementById('rawCsvCode');
    const btnCopyCsv = document.getElementById('btnCopyCsv');
    const btnDownloadCsv = document.getElementById('btnDownloadCsv');

    // Date Search in Preview
    const previewDateSearchInput = document.getElementById('previewDateSearchInput');
    const clearDateSearch = document.getElementById('clearDateSearch');
    const dateFilterStatus = document.getElementById('dateFilterStatus');

    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Upload Modal
    const btnUploadModal = document.getElementById('btnUploadModal');
    const uploadModal = document.getElementById('uploadModal');
    const btnCloseUploadModal = document.getElementById('btnCloseUploadModal');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressText = document.getElementById('progressText');

    // Initialize App
    init();

    async function init() {
        setupEventListeners();
        await loadStatus();
        await loadBatches();
    }

    function setupEventListeners() {
        // Batch search
        batchSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            clearBatchSearch.classList.toggle('hidden', query.length === 0);
            filterBatches(query);
        });

        clearBatchSearch.addEventListener('click', () => {
            batchSearchInput.value = '';
            clearBatchSearch.classList.add('hidden');
            filterBatches('');
        });

        // Batch selection
        batchSelect.addEventListener('change', async (e) => {
            const batchName = e.target.value;
            if (batchName) {
                await selectBatch(batchName);
            }
        });

        // Student search
        studentSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterStudents(query);
        });

        // Select All / Deselect All
        btnSelectAllStudents.addEventListener('click', () => {
            state.filteredStudents.forEach(s => state.selectedStudentIds.add(s.id));
            updateStudentSelectionUI();
            triggerPreview();
        });

        btnDeselectAllStudents.addEventListener('click', () => {
            state.filteredStudents.forEach(s => state.selectedStudentIds.delete(s.id));
            updateStudentSelectionUI();
            triggerPreview();
        });

        // Deduplicate toggle
        chkDeduplicate.addEventListener('change', (e) => {
            state.deduplicate = e.target.checked;
            triggerPreview();
        });

        // Student ID Format radio selection
        const idFormatInputs = document.querySelectorAll('input[name="idFormat"]');
        idFormatInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                if (e.target.checked) {
                    state.idFormat = e.target.value;
                    document.querySelectorAll('.id-format-card').forEach(card => card.classList.remove('active'));
                    e.target.closest('.id-format-card')?.classList.add('active');
                    if (state.idFormat === 'custom' && customPrefixInput) {
                        customPrefixInput.focus();
                    }
                    triggerPreview();
                }
            });
        });

        // Custom Prefix input handling
        if (customPrefixInput) {
            customPrefixInput.addEventListener('input', (e) => {
                state.customPrefix = e.target.value;
                if (customExampleCode) {
                    customExampleCode.textContent = (state.customPrefix || '') + '1730705';
                }
                const customRadio = document.querySelector('input[name="idFormat"][value="custom"]');
                if (customRadio && !customRadio.checked) {
                    customRadio.checked = true;
                    state.idFormat = 'custom';
                    document.querySelectorAll('.id-format-card').forEach(card => card.classList.remove('active'));
                    cardCustomPrefix?.classList.add('active');
                }
                triggerPreview();
            });

            customPrefixInput.addEventListener('focus', () => {
                const customRadio = document.querySelector('input[name="idFormat"][value="custom"]');
                if (customRadio && !customRadio.checked) {
                    customRadio.checked = true;
                    state.idFormat = 'custom';
                    document.querySelectorAll('.id-format-card').forEach(card => card.classList.remove('active'));
                    cardCustomPrefix?.classList.add('active');
                    triggerPreview();
                }
            });
        }

        // Preview Date Search
        if (previewDateSearchInput) {
            previewDateSearchInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                state.dateSearch = val;
                if (clearDateSearch) {
                    clearDateSearch.classList.toggle('hidden', val.length === 0);
                }
                if (dateFilterStatus) {
                    dateFilterStatus.style.display = val.length > 0 ? 'inline-flex' : 'none';
                }
                triggerPreview();
            });
        }

        if (clearDateSearch) {
            clearDateSearch.addEventListener('click', () => {
                if (previewDateSearchInput) {
                    previewDateSearchInput.value = '';
                }
                state.dateSearch = '';
                clearDateSearch.classList.add('hidden');
                if (dateFilterStatus) {
                    dateFilterStatus.style.display = 'none';
                }
                triggerPreview();
            });
        }

        // Tabs
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.tab;
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(targetId).classList.add('active');
            });
        });

        // Copy CSV
        btnCopyCsv.addEventListener('click', () => {
            if (rawCsvCode.textContent) {
                navigator.clipboard.writeText(rawCsvCode.textContent).then(() => {
                    showToast('CSV copied to clipboard!', 'success');
                }).catch(() => {
                    showToast('Failed to copy', 'error');
                });
            }
        });

        // Download CSV
        btnDownloadCsv.addEventListener('click', downloadCsvFile);

        // Upload Modal
        btnUploadModal.addEventListener('click', () => uploadModal.classList.remove('hidden'));
        btnCloseUploadModal.addEventListener('click', () => uploadModal.classList.add('hidden'));

        // Drag & Drop
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }

    async function loadStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            totalBatchesCount.textContent = data.total_batches || 0;
            totalStudentsCount.textContent = data.total_students || 0;
        } catch (err) {
            console.error('Error fetching status:', err);
        }
    }

    async function loadBatches() {
        try {
            batchSelect.innerHTML = '<option value="" disabled selected>Loading batches...</option>';
            const res = await fetch('/api/batches');
            const data = await res.json();
            state.batches = data.batches || [];
            state.filteredBatches = [...state.batches];
            renderBatches();
        } catch (err) {
            batchSelect.innerHTML = '<option value="" disabled>Failed to load batches</option>';
            showToast('Error loading batches', 'error');
        }
    }

    function filterBatches(query) {
        if (!query) {
            state.filteredBatches = [...state.batches];
        } else {
            state.filteredBatches = state.batches.filter(b => 
                b.batch_name.toLowerCase().includes(query) ||
                (b.course_code && b.course_code.toLowerCase().includes(query))
            );
        }
        renderBatches();
    }

    function renderBatches() {
        if (state.filteredBatches.length === 0) {
            batchSelect.innerHTML = '<option value="" disabled>No matching batches found</option>';
            return;
        }

        batchSelect.innerHTML = state.filteredBatches.map(b => `
            <option value="${escapeHtml(b.batch_name)}" ${state.currentBatch === b.batch_name ? 'selected' : ''}>
                ${escapeHtml(b.batch_name)} (${b.student_count} Students, ${b.date_count} Days)
            </option>
        `).join('');

        if (state.currentBatch) {
            batchSelect.value = state.currentBatch;
        }
    }

    async function selectBatch(batchName) {
        state.currentBatch = batchName;
        const batchInfo = state.batches.find(b => b.batch_name === batchName);

        // Show metadata
        if (batchInfo) {
            metaCourseCode.textContent = batchInfo.course_code || 'N/A';
            metaDateCount.textContent = batchInfo.date_count;
            metaStudentCount.textContent = batchInfo.student_count;
            selectedBatchMeta.style.display = 'flex';
        }

        // Fetch students & dates
        studentListContainer.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading students...</p></div>';
        
        try {
            const res = await fetch(`/api/batches/${encodeURIComponent(batchName)}/details`);
            const data = await res.json();
            state.students = data.students || [];
            state.filteredStudents = [...state.students];
            state.dates = data.dates || [];

            // By default, select all students in the batch
            state.selectedStudentIds = new Set(state.students.map(s => s.id));
            studentSearchInput.value = '';

            renderStudents();
            updateStudentSelectionUI();
            triggerPreview();
        } catch (err) {
            showToast('Error loading students for batch', 'error');
            studentListContainer.innerHTML = '<div class="empty-state"><p>Error loading students</p></div>';
        }
    }

    function filterStudents(query) {
        if (!query) {
            state.filteredStudents = [...state.students];
        } else {
            state.filteredStudents = state.students.filter(s => 
                s.name.toLowerCase().includes(query) ||
                s.id.toLowerCase().includes(query) ||
                s.raw_id.toLowerCase().includes(query)
            );
        }
        renderStudents();
    }

    function renderStudents() {
        if (state.filteredStudents.length === 0) {
            studentListContainer.innerHTML = '<div class="empty-state"><p>No students match filter</p></div>';
            return;
        }

        studentListContainer.innerHTML = state.filteredStudents.map(s => {
            const isChecked = state.selectedStudentIds.has(s.id);
            return `
                <div class="student-item ${isChecked ? 'selected' : ''}" data-student-id="${s.id}">
                    <div class="student-info">
                        <input type="checkbox" class="student-checkbox" ${isChecked ? 'checked' : ''} data-id="${s.id}">
                        <div>
                            <div class="student-name">${escapeHtml(s.name)}</div>
                            <span class="student-id-tag">${s.id}</span>
                        </div>
                    </div>
                    <span class="student-days-badge">${s.attendance_days} Days</span>
                </div>
            `;
        }).join('');

        // Item click listeners
        studentListContainer.querySelectorAll('.student-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const sid = item.dataset.studentId;
                const checkbox = item.querySelector('.student-checkbox');
                
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }

                if (checkbox.checked) {
                    state.selectedStudentIds.add(sid);
                } else {
                    state.selectedStudentIds.delete(sid);
                }

                updateStudentSelectionUI();
                triggerPreview();
            });
        });
    }

    function sanitizeFilenamePart(text) {
        if (!text) return '';
        let cleaned = text.trim().replace(/\.+$/, '');
        cleaned = cleaned.replace(/\s+/g, '_');
        cleaned = cleaned.replace(/[^a-zA-Z0-9_\-]/g, '');
        return cleaned.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    }

    function getTargetFilename() {
        if (!state.currentBatch) return 'attendanceImport.csv';
        const safeBatch = sanitizeFilenamePart(state.currentBatch);
        const selectedIds = Array.from(state.selectedStudentIds);
        
        if (selectedIds.length === 0) {
            return safeBatch ? `attendanceImport_${safeBatch}.csv` : 'attendanceImport.csv';
        }

        // Get student names
        const selectedNames = [];
        for (const sid of selectedIds) {
            const student = state.students.find(s => s.id === sid);
            if (student && student.name) {
                const cleanName = sanitizeFilenamePart(student.name);
                if (cleanName) selectedNames.push(cleanName);
            }
        }

        // If all students in batch are selected or more than 3 students, use batch name
        if (selectedIds.length === state.students.length || selectedNames.length > 3) {
            return safeBatch ? `attendanceImport_${safeBatch}.csv` : 'attendanceImport.csv';
        }

        if (selectedNames.length > 0) {
            const attached = selectedNames.join('_');
            return safeBatch ? `attendanceImport_${safeBatch}_${attached}.csv` : `attendanceImport_${attached}.csv`;
        }

        const safeIds = selectedIds.slice(0, 3).map(sanitizeFilenamePart).join('_');
        return safeBatch ? `attendanceImport_${safeBatch}_${safeIds}.csv` : `attendanceImport_${safeIds}.csv`;
    }

    function updateStudentSelectionUI() {
        selectedCountBadge.textContent = `${state.selectedStudentIds.size} of ${state.students.length} Selected`;

        // Update item classes
        studentListContainer.querySelectorAll('.student-item').forEach(item => {
            const sid = item.dataset.studentId;
            const checkbox = item.querySelector('.student-checkbox');
            const isChecked = state.selectedStudentIds.has(sid);
            if (checkbox) checkbox.checked = isChecked;
            item.classList.toggle('selected', isChecked);
        });

        const targetFilename = getTargetFilename();
        const isDisabled = (state.selectedStudentIds.size === 0 || !state.currentBatch);
        btnDownloadCsv.disabled = isDisabled;
        
        // Truncate long button label cleanly
        let displayFilename = targetFilename;
        if (displayFilename.length > 32) {
            displayFilename = displayFilename.substring(0, 29) + '...csv';
        }
        btnDownloadCsv.innerHTML = `<i class="fa-solid fa-file-arrow-down"></i> Download ${escapeHtml(displayFilename)}`;
        btnDownloadCsv.title = `Download ${targetFilename}`;
    }

    let previewDebounceTimer = null;
    function triggerPreview() {
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(loadPreview, 150);
    }

    async function loadPreview() {
        if (!state.currentBatch || state.selectedStudentIds.size === 0) {
            previewRecordCount.textContent = '0';
            previewTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-5 text-muted">
                        <i class="fa-solid fa-arrow-left fa-2x mb-2 d-block"></i>
                        Select a batch and student(s) to preview attendance
                    </td>
                </tr>
            `;
            rawCsvCode.textContent = 'Student ID,Date,Status\n1363347,12/20/2024,P';
            return;
        }

        try {
            const payload = {
                batch_name: state.currentBatch,
                student_ids: Array.from(state.selectedStudentIds),
                date_search: state.dateSearch,
                deduplicate: state.deduplicate,
                id_format: state.idFormat,
                custom_prefix: state.customPrefix
            };

            const res = await fetch('/api/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            
            // Format record count with filter indication
            if (data.is_date_filtered) {
                previewRecordCount.textContent = `${data.total_records.toLocaleString()} (filtered from ${data.total_unfiltered_records.toLocaleString()})`;
            } else {
                previewRecordCount.textContent = data.total_records.toLocaleString();
            }
            
            // Render Table
            if (data.preview_rows && data.preview_rows.length > 0) {
                previewTableBody.innerHTML = data.preview_rows.map((r, idx) => {
                    const dateDisplay = state.dateSearch ? 
                        highlightMatch(escapeHtml(r['Date']), escapeHtml(state.dateSearch)) : 
                        escapeHtml(r['Date']);
                    return `
                        <tr>
                            <td class="text-muted">${idx + 1}</td>
                            <td><strong>${escapeHtml(r['Student ID'])}</strong></td>
                            <td>${dateDisplay}</td>
                            <td><span class="badge badge-accent">P</span></td>
                        </tr>
                    `;
                }).join('');
                
                if (data.total_records > data.preview_rows.length) {
                    previewTableBody.innerHTML += `
                        <tr>
                            <td colspan="4" class="text-center text-muted py-2">
                                ... and ${(data.total_records - data.preview_rows.length).toLocaleString()} more records included in export ...
                            </td>
                        </tr>
                    `;
                }
            } else {
                previewTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center py-5 text-muted">
                            <i class="fa-solid fa-calendar-xmark fa-2x mb-2 d-block text-warning"></i>
                            No attendance records match date "${escapeHtml(state.dateSearch)}"
                        </td>
                    </tr>
                `;
            }

            // Render Raw CSV
            rawCsvCode.textContent = data.sample_csv || '';
            btnDownloadCsv.disabled = false;
            
            if (data.suggested_filename) {
                let displayFilename = data.suggested_filename;
                if (displayFilename.length > 32) {
                    displayFilename = displayFilename.substring(0, 29) + '...csv';
                }
                btnDownloadCsv.innerHTML = `<i class="fa-solid fa-file-arrow-down"></i> Download ${escapeHtml(displayFilename)}`;
                btnDownloadCsv.title = `Download ${data.suggested_filename}`;
            }
        } catch (err) {
            console.error('Preview error:', err);
        }
    }

    function highlightMatch(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark class="highlight-date">$1</mark>');
    }

    async function downloadCsvFile() {
        if (!state.currentBatch || state.selectedStudentIds.size === 0) {
            showToast('Please select at least one student', 'warning');
            return;
        }

        const payload = {
            batch_name: state.currentBatch,
            student_ids: Array.from(state.selectedStudentIds),
            date_search: state.dateSearch,
            deduplicate: state.deduplicate,
            id_format: state.idFormat,
            custom_prefix: state.customPrefix
        };

        const targetFilename = getTargetFilename();

        try {
            btnDownloadCsv.disabled = true;
            btnDownloadCsv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

            const res = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Retrieve suggested filename from header if available
            let filename = res.headers.get('X-Suggested-Filename') || targetFilename;

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);

            showToast(`Downloaded ${filename} successfully!`, 'success');
        } catch (err) {
            showToast('Download failed', 'error');
        } finally {
            updateStudentSelectionUI();
        }
    }

    async function handleFileUpload(file) {
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            showToast('Please upload an Excel (.xlsx or .xls) file', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        uploadProgress.classList.remove('hidden');
        progressBarFill.style.width = '30%';
        progressText.textContent = `Uploading ${file.name}...`;

        try {
            progressBarFill.style.width = '60%';
            progressText.textContent = 'Parsing Excel data & updating cache...';

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            progressBarFill.style.width = '100%';
            const data = await res.json();

            if (data.success) {
                showToast('Report uploaded & reloaded successfully!', 'success');
                setTimeout(() => {
                    uploadModal.classList.add('hidden');
                    uploadProgress.classList.add('hidden');
                    progressBarFill.style.width = '0%';
                    loadStatus();
                    loadBatches();
                }, 800);
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (err) {
            showToast(err.message || 'Upload error', 'error');
            uploadProgress.classList.add('hidden');
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'success' ? 'circle-check text-success' : 
                     type === 'error' ? 'circle-xmark text-danger' : 
                     type === 'warning' ? 'triangle-exclamation text-warning' : 'circle-info text-accent';
        
        toast.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${escapeHtml(message)}</span>`;
        document.getElementById('toastContainer').appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
