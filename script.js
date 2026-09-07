document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const themeToggle = document.getElementById('theme-toggle');
    const exportPdf = document.getElementById('export-pdf');
    const runSimBtn = document.getElementById('run-sim');
    const compareBtn = document.getElementById('compare-algs');
    const resetBtn = document.getElementById('reset-sim');
    const backBtn = document.getElementById('back-to-sim');
    
    // View sections
    const simView = document.getElementById('simulation-view');
    const compView = document.getElementById('comparison-view');
    
    // Theme Management
    const initTheme = () => {
        const isDark = localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (isDark) {
            document.body.classList.add('dark-theme');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            document.body.classList.remove('dark-theme');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    };
    initTheme();

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        if (!compView.classList.contains('hidden')) updateChartsTheme();
    });

    // Collapsible Logic
    const complexityHeader = document.getElementById('complexity-header');
    if (complexityHeader) {
        complexityHeader.addEventListener('click', () => {
            const content = document.getElementById('complexity-content');
            const icon = complexityHeader.querySelector('.chevron-icon');
            content.classList.toggle('hidden');
            icon.classList.toggle('open');
        });
    }

    // Chart instances
    let faultsChartInstance = null;
    let hitsChartInstance = null;

    // Simulation State
    let state = {
        history: [],
        currentStep: 0,
        isPlaying: false,
        interval: null,
        speed: 800
    };

    // Parse Inputs
    const getInputs = () => {
        const frames = parseInt(document.getElementById('frames').value);
        const refStringStr = document.getElementById('reference-string').value;
        const algorithm = document.getElementById('algorithm').value;
        
        if (isNaN(frames) || frames < 1) {
            alert('Please enter a valid number of frames (>= 1).');
            return null;
        }

        const refString = refStringStr.split(',').map(s => s.trim()).filter(s => s !== '').map(Number);
        if (refString.length === 0 || refString.some(isNaN)) {
            alert('Please enter a valid comma-separated reference string of numbers.');
            return null;
        }

        return { frames, refString, algorithm };
    };

    // ALGORITHMS
    // Return format: [{ page, frames: [...], isHit, replacedPage }]
    const runFIFO = (framesCount, pages) => {
        let frames = [];
        let history = [];
        let queue = []; // To track insertion order

        pages.forEach(page => {
            let isHit = frames.includes(page);
            let replacedPage = null;

            if (!isHit) {
                if (frames.length < framesCount) {
                    frames.push(page);
                    queue.push(page);
                } else {
                    replacedPage = queue.shift();
                    let index = frames.indexOf(replacedPage);
                    frames[index] = page;
                    queue.push(page);
                }
            }
            history.push({ page, frames: [...frames], isHit, replacedPage });
        });
        return history;
    };

    const runLRU = (framesCount, pages) => {
        let frames = [];
        let history = [];
        let recent = []; // Tracks recent usage, end of array is most recent

        pages.forEach(page => {
            let isHit = frames.includes(page);
            let replacedPage = null;

            if (isHit) {
                // Update recent usage
                recent = recent.filter(p => p !== page);
                recent.push(page);
            } else {
                if (frames.length < framesCount) {
                    frames.push(page);
                    recent.push(page);
                } else {
                    replacedPage = recent.shift(); // Least recently used
                    let index = frames.indexOf(replacedPage);
                    frames[index] = page;
                    recent.push(page);
                }
            }
            history.push({ page, frames: [...frames], isHit, replacedPage });
        });
        return history;
    };

    const runOptimal = (framesCount, pages) => {
        let frames = [];
        let history = [];

        pages.forEach((page, currentIndex) => {
            let isHit = frames.includes(page);
            let replacedPage = null;

            if (!isHit) {
                if (frames.length < framesCount) {
                    frames.push(page);
                } else {
                    // Find the page to replace
                    let farthestIndex = -1;
                    let pageToReplace = -1;

                    for (let i = 0; i < frames.length; i++) {
                        let nextUse = pages.slice(currentIndex + 1).indexOf(frames[i]);
                        if (nextUse === -1) {
                            pageToReplace = frames[i];
                            break; // This page is never used again
                        } else {
                            if (nextUse > farthestIndex) {
                                farthestIndex = nextUse;
                                pageToReplace = frames[i];
                            }
                        }
                    }

                    replacedPage = pageToReplace;
                    let index = frames.indexOf(replacedPage);
                    frames[index] = page;
                }
            }
            history.push({ page, frames: [...frames], isHit, replacedPage });
        });
        return history;
    };

    const runLFU = (framesCount, pages) => {
        let frames = [];
        let history = [];
        let frequencies = {};
        let insertTime = {}; // For tie-breaking (FIFO for same freq)
        let time = 0;

        pages.forEach(page => {
            time++;
            frequencies[page] = (frequencies[page] || 0) + 1;
            
            let isHit = frames.includes(page);
            let replacedPage = null;

            if (isHit) {
                // Just update frequency, insertTime remains same
            } else {
                if (frames.length < framesCount) {
                    frames.push(page);
                    insertTime[page] = time;
                } else {
                    // Find least frequently used
                    let minFreq = Infinity;
                    let minTime = Infinity;
                    let pageToReplace = null;

                    frames.forEach(f => {
                        if (frequencies[f] < minFreq) {
                            minFreq = frequencies[f];
                            minTime = insertTime[f];
                            pageToReplace = f;
                        } else if (frequencies[f] === minFreq && insertTime[f] < minTime) {
                            minTime = insertTime[f];
                            pageToReplace = f;
                        }
                    });

                    replacedPage = pageToReplace;
                    let index = frames.indexOf(replacedPage);
                    frames[index] = page;
                    insertTime[page] = time;
                }
            }
            history.push({ page, frames: [...frames], isHit, replacedPage });
        });
        return history;
    };

    const executeAlgorithm = (algorithm, frames, refString) => {
        let start = performance.now();
        let history = [];
        switch (algorithm) {
            case 'fifo': history = runFIFO(frames, refString); break;
            case 'lru': history = runLRU(frames, refString); break;
            case 'optimal': history = runOptimal(frames, refString); break;
            case 'lfu': history = runLFU(frames, refString); break;
        }
        let end = performance.now();
        return { history, time: (end - start).toFixed(2) };
    };

    // UI Updates
    const initTableHeaders = (framesCount) => {
        const head = document.getElementById('sim-table-head');
        let html = `<th>Step</th><th>Page</th>`;
        for (let i = 1; i <= framesCount; i++) {
            html += `<th>Frame ${i}</th>`;
        }
        html += `<th>Status</th><th>Replaced</th>`;
        head.innerHTML = html;
    };

    const renderTableStep = (stepInfo, stepIndex, framesCount) => {
        const tbody = document.getElementById('sim-table-body');
        const tr = document.createElement('tr');
        
        let framesHtml = '';
        for (let i = 0; i < framesCount; i++) {
            const f = stepInfo.frames[i];
            framesHtml += `<td>${f !== undefined ? f : '-'}</td>`;
        }

        tr.innerHTML = `
            <td>${stepIndex + 1}</td>
            <td><strong>${stepInfo.page}</strong></td>
            ${framesHtml}
            <td class="${stepInfo.isHit ? 'hit-cell' : 'fault-cell'}">${stepInfo.isHit ? 'Hit' : 'Fault'}</td>
            <td>${stepInfo.replacedPage !== null ? stepInfo.replacedPage : '-'}</td>
        `;
        tbody.appendChild(tr);
        // Scroll to bottom
        tbody.parentElement.parentElement.scrollTop = tbody.parentElement.parentElement.scrollHeight;
    };

    const updateStats = (history) => {
        const total = history.length;
        const hits = history.filter(h => h.isHit).length;
        const faults = total - hits;
        const hitRatio = total ? ((hits / total) * 100).toFixed(1) : 0;
        const faultRatio = total ? ((faults / total) * 100).toFixed(1) : 0;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-hits').textContent = hits;
        document.getElementById('stat-faults').textContent = faults;
        document.getElementById('stat-hit-ratio').textContent = `${hitRatio}%`;
        document.getElementById('stat-fault-ratio').textContent = `${faultRatio}%`;
    };

    const renderVisualization = (stepIndex, framesCount) => {
        if (stepIndex < 0 || stepIndex >= state.history.length) return;
        
        const step = state.history[stepIndex];
        
        // Controls Update
        document.getElementById('step-counter').textContent = `Step ${stepIndex + 1} / ${state.history.length}`;
        document.getElementById('step-prev').disabled = stepIndex === 0;
        document.getElementById('step-next').disabled = stepIndex === state.history.length - 1;

        // Incoming Page
        const incomingEl = document.getElementById('viz-incoming');
        incomingEl.textContent = step.page;
        incomingEl.classList.remove('empty');
        
        // Apply animation class
        incomingEl.classList.remove('anim-slide-in');
        void incomingEl.offsetWidth; // trigger reflow
        incomingEl.classList.add('anim-slide-in');

        // Frames
        const framesContainer = document.getElementById('viz-frames');
        framesContainer.innerHTML = '';
        
        for (let i = 0; i < framesCount; i++) {
            const frameVal = step.frames[i];
            const div = document.createElement('div');
            div.className = 'page-box';
            
            if (frameVal === undefined) {
                div.classList.add('empty');
                div.textContent = '-';
            } else {
                div.textContent = frameVal;
                // Highlight logic
                if (frameVal === step.page && step.isHit) {
                    div.classList.add('frame-hit', 'anim-pop');
                } else if (frameVal === step.page && !step.isHit) {
                    div.classList.add('frame-fault', 'anim-pop');
                }
            }
            framesContainer.appendChild(div);
        }

        // Status Badge
        const statusBadge = document.getElementById('viz-status');
        if (step.isHit) {
            statusBadge.textContent = 'Hit';
            statusBadge.className = 'status-badge hit anim-pop';
        } else {
            statusBadge.textContent = 'Page Fault';
            statusBadge.className = 'status-badge fault anim-pop';
        }
    };

    let currentRecentStr = null;

    // Save recent
    const saveRecent = (frames, refString, alg) => {
        let recents = JSON.parse(localStorage.getItem('recentSims') || '[]');
        const str = `${alg.toUpperCase()} | ${frames} Frames | ${refString.length} Pages`;
        const item = { str, frames, refString: refString.join(','), alg };
        
        recents = recents.filter(r => r.str !== str);
        recents.unshift(item);
        if (recents.length > 5) recents.pop();
        
        localStorage.setItem('recentSims', JSON.stringify(recents));
        renderRecents();
    };

    const renderRecents = () => {
        const recents = JSON.parse(localStorage.getItem('recentSims') || '[]');
        const list = document.getElementById('recent-list');
        list.innerHTML = '';
        recents.forEach(r => {
            const badge = document.createElement('span');
            badge.className = 'badge';
            if (r.str === currentRecentStr) {
                badge.classList.add('active-recent');
            }
            badge.textContent = r.str;
            badge.title = r.refString;
            badge.addEventListener('click', () => {
                document.getElementById('frames').value = r.frames;
                document.getElementById('reference-string').value = r.refString;
                document.getElementById('algorithm').value = r.alg;
            });
            list.appendChild(badge);
        });
    };
    renderRecents();

    // Player Controls
    const pauseSimulation = () => {
        state.isPlaying = false;
        clearInterval(state.interval);
        document.getElementById('play-pause').innerHTML = '<i class="fa-solid fa-play"></i>';
    };

    const playSimulation = (framesCount) => {
        if (state.currentStep >= state.history.length - 1) return;
        state.isPlaying = true;
        document.getElementById('play-pause').innerHTML = '<i class="fa-solid fa-pause"></i>';
        
        state.interval = setInterval(() => {
            if (state.currentStep < state.history.length - 1) {
                state.currentStep++;
                renderVisualization(state.currentStep, framesCount);
                renderTableStep(state.history[state.currentStep], state.currentStep, framesCount);
            } else {
                pauseSimulation();
            }
        }, state.speed);
    };

    document.getElementById('play-pause').addEventListener('click', () => {
        const inputs = getInputs();
        if (state.isPlaying) {
            pauseSimulation();
        } else {
            playSimulation(inputs.frames);
        }
    });

    document.getElementById('step-next').addEventListener('click', () => {
        const inputs = getInputs();
        if (state.currentStep < state.history.length - 1) {
            state.currentStep++;
            renderVisualization(state.currentStep, inputs.frames);
            renderTableStep(state.history[state.currentStep], state.currentStep, inputs.frames);
        }
    });

    document.getElementById('step-prev').addEventListener('click', () => {
        const inputs = getInputs();
        if (state.currentStep > 0) {
            state.currentStep--;
            renderVisualization(state.currentStep, inputs.frames);
            // Re-render table up to current step
            document.getElementById('sim-table-body').innerHTML = '';
            for(let i=0; i<=state.currentStep; i++) {
                renderTableStep(state.history[i], i, inputs.frames);
            }
        }
    });

    document.getElementById('speed-slider').addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        state.speed = 2100 - val;
        
        if (state.isPlaying) {
            pauseSimulation();
            playSimulation(getInputs().frames);
        }
    });

    // Run Simulation
    runSimBtn.addEventListener('click', () => {
        const inputs = getInputs();
        if (!inputs) return;

        pauseSimulation();
        
        // Show view
        simView.classList.remove('hidden');
        compView.classList.add('hidden');
        
        // Execute
        const res = executeAlgorithm(inputs.algorithm, inputs.frames, inputs.refString);
        state.history = res.history;
        state.currentStep = 0;
        
        // Init UI
        document.getElementById('sim-table-body').innerHTML = '';
        initTableHeaders(inputs.frames);
        updateStats(state.history);
        
        // Render step 0
        renderVisualization(0, inputs.frames);
        renderTableStep(state.history[0], 0, inputs.frames);
        
        // Enable buttons
        document.getElementById('play-pause').disabled = false;
        document.getElementById('step-next').disabled = state.history.length <= 1;
        document.getElementById('step-prev').disabled = true;
        
        currentRecentStr = `${inputs.algorithm.toUpperCase()} | ${inputs.frames} Frames | ${inputs.refString.length} Pages`;
        saveRecent(inputs.frames, inputs.refString, inputs.algorithm);
        
        // Auto play
        playSimulation(inputs.frames);
    });

    resetBtn.addEventListener('click', () => {
        document.getElementById('frames').value = 3;
        document.getElementById('reference-string').value = '7,0,1,2,0,3,0,4,2,3,0,3,2,1,2,0,1,7,0,1';
        simView.classList.add('hidden');
        compView.classList.add('hidden');
        pauseSimulation();
    });

    // --- Comparison Mode --- //
    const updateChartsTheme = () => {
        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#f8fafc' : '#1f2937';
        const gridColor = isDark ? '#334155' : '#e5e7eb';
        
        const options = {
            color: textColor,
            scales: {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: { ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: { legend: { labels: { color: textColor } } }
        };

        if (faultsChartInstance) { faultsChartInstance.options = { ...faultsChartInstance.options, ...options }; faultsChartInstance.update(); }
        if (hitsChartInstance) { hitsChartInstance.options = { ...hitsChartInstance.options, ...options }; hitsChartInstance.update(); }
    };

    compareBtn.addEventListener('click', () => {
        const inputs = getInputs();
        if (!inputs) return;

        pauseSimulation();
        simView.classList.add('hidden');
        compView.classList.remove('hidden');

        const algos = ['fifo', 'lru', 'optimal', 'lfu'];
        const names = ['FIFO', 'LRU', 'Optimal', 'LFU'];
        const useCases = ['Simple queue-based systems', 'Real-world memory management', 'Theoretical benchmark', 'Frequency-based workloads'];
        const results = [];
        
        let bestAlg = null;
        let minFaults = Infinity;

        algos.forEach((alg, idx) => {
            const res = executeAlgorithm(alg, inputs.frames, inputs.refString);
            const total = res.history.length;
            const hits = res.history.filter(h => h.isHit).length;
            const faults = total - hits;
            const hitRatio = total ? ((hits/total)*100).toFixed(1) : 0;
            
            if (faults < minFaults) {
                minFaults = faults;
                bestAlg = { name: names[idx], faults, hitRatio };
            }
            
            results.push({
                name: names[idx],
                hits,
                faults,
                hitRatio,
                faultRatio: total ? ((faults/total)*100).toFixed(1) : 0,
                useCase: useCases[idx],
                time: res.time
            });
        });

        if (bestAlg) {
            document.getElementById('best-alg-name').textContent = bestAlg.name;
            document.getElementById('best-alg-faults').textContent = bestAlg.faults;
            document.getElementById('best-alg-ratio').textContent = `${bestAlg.hitRatio}%`;
        }

        // Render Table
        const tbody = document.getElementById('comp-table-body');
        tbody.innerHTML = '';
        results.forEach(r => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${r.name}</strong></td>
                    <td class="hit-cell">${r.hits}</td>
                    <td class="fault-cell">${r.faults}</td>
                    <td>${r.hitRatio}%</td>
                    <td>${r.faultRatio}%</td>
                    <td>${r.useCase}</td>
                    <td>${r.time}</td>
                </tr>
            `;
        });

        // Render Charts
        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#f8fafc' : '#1f2937';
        const gridColor = isDark ? '#334155' : '#e5e7eb';

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            color: textColor,
            scales: {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: { ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
                legend: { display: false }
            }
        };

        if (faultsChartInstance) faultsChartInstance.destroy();
        const ctxFaults = document.getElementById('faultsChart').getContext('2d');
        faultsChartInstance = new Chart(ctxFaults, {
            type: 'bar',
            data: {
                labels: names,
                datasets: [{
                    label: 'Page Faults',
                    data: results.map(r => r.faults),
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: 'rgb(239, 68, 68)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: chartOptions
        });

        if (hitsChartInstance) hitsChartInstance.destroy();
        const ctxHits = document.getElementById('hitsChart').getContext('2d');
        hitsChartInstance = new Chart(ctxHits, {
            type: 'bar',
            data: {
                labels: names,
                datasets: [{
                    label: 'Page Hits',
                    data: results.map(r => r.hits),
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: 'rgb(16, 185, 129)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: chartOptions
        });
    });

    backBtn.addEventListener('click', () => {
        compView.classList.add('hidden');
        if (state.history.length > 0) {
            simView.classList.remove('hidden');
        }
    });

    // Export PDF
    exportPdf.addEventListener('click', () => {
        const element = document.getElementById('main-content');
        const opt = {
            margin:       0.5,
            filename:     'MemScope_Simulation_Report.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        element.classList.add('pdf-export-mode');
        html2pdf().set(opt).from(element).save().then(() => {
            element.classList.remove('pdf-export-mode');
        });
    });
});
