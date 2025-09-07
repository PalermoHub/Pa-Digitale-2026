// Variabili globali
let map;
let comuniLayer;
let comuniData = [];
let candidatureData = [];
let currentFilters = {
    regione: '',
    provincia: '',
    comune: '',
    avviso: ''
};
let tooltip;
let updateInterval;

// Variabili per la vista iniziale della mappa
let initialMapView = {
    center: null,
    zoom: null
};

// Variabili per la tabella dati
let currentTableData = [];
let tableSortColumn = '';
let tableSortDirection = 'asc';
let currentPage = 1;
let recordsPerPage = 50;

// Variabile per il debounce del grafico
let chartUpdateTimeout;

// Funzioni per gestire il modal informativo
function openInfoModal() {
    document.getElementById('infoModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('active');
    document.body.style.overflow = '';
}

// Funzione per creare link CUP
function createCupLink(cupCode) {
    if (!cupCode || cupCode === '-' || cupCode.trim() === '') {
        return '-';
    }
    
    const baseUrl = 'https://www.opencup.gov.it/portale/it/web/opencup/home/progetto/-/cup/';
    const fullUrl = baseUrl + encodeURIComponent(cupCode);
    
    return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: none; font-weight: 500;" title="Apri dettaglio progetto OpenCUP">${cupCode}</a>`;
}

// Mappatura nomi regioni ai codici per i colori
const regionNameToCode = {
    'Piemonte': '1',
    'Valle d\'Aosta/Vallée d\'Aoste': '2',
    'Lombardia': '3',
    'Trentino-Alto Adige/Südtirol': '4',
    'Veneto': '5',
    'Friuli-Venezia Giulia': '6',
    'Liguria': '7',
    'Emilia-Romagna': '8',
    'Toscana': '9',
    'Umbria': '10',
    'Marche': '11',
    'Lazio': '12',
    'Abruzzo': '13',
    'Molise': '14',
    'Campania': '15',
    'Puglia': '16',
    'Basilicata': '17',
    'Calabria': '18',
    'Sicilia': '19',
    'Sardegna': '20'
};

// Palette di colori moderna per le regioni
const regionColors = {
    '1': '#EF4444',   // Piemonte - Rosso moderno
    '2': '#06B6D4',   // Valle d'Aosta - Ciano
    '3': '#3B82F6',   // Lombardia - Blu
    '4': '#10B981',   // Trentino-Alto Adige - Smeraldo
    '5': '#F59E0B',   // Veneto - Ambra
    '6': '#8B5CF6',   // Friuli-Venezia Giulia - Viola
    '7': '#14B8A6',   // Liguria - Teal
    '8': '#F97316',   // Emilia-Romagna - Arancione
    '9': '#A855F7',   // Toscana - Porpora
    '10': '#0EA5E9',  // Umbria - Sky
    '11': '#FB923C',  // Marche - Arancione chiaro
    '12': '#22C55E',  // Lazio - Verde
    '13': '#EC4899',  // Abruzzo - Rosa
    '14': '#6366F1',  // Molise - Indaco
    '15': '#84CC16',  // Campania - Lime
    '16': '#FBBF24',  // Puglia - Giallo
    '17': '#F87171',  // Basilicata - Rosa-rosso
    '18': '#60A5FA',  // Calabria - Blu chiaro
    '19': '#FACC15',  // Sicilia - Giallo intenso
    '20': '#34D399'   // Sardegna - Verde smeraldo
};

// ========== FUNZIONI PER LA GESTIONE DELLA CACHE ==========

// Funzione per inizializzare IndexedDB
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PADigitale2026DB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('data')) {
                db.createObjectStore('data', { keyPath: 'key' });
            }
        };
    });
}

// Funzione per salvare dati in IndexedDB
async function saveToIndexedDB(key, data) {
    try {
        const db = await initIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['data'], 'readwrite');
            const store = transaction.objectStore('data');
            const request = store.put({ key, data, timestamp: Date.now() });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Errore nel salvataggio su IndexedDB:', error);
        return false;
    }
}

// Funzione per caricare dati da IndexedDB
async function loadFromIndexedDB(key) {
    try {
        const db = await initIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['data'], 'readonly');
            const store = transaction.objectStore('data');
            const request = store.get(key);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Errore nel caricamento da IndexedDB:', error);
        return null;
    }
}

// Funzione per ottimizzare i dati per lo storage
function optimizeDataForStorage(data) {
    const optimized = {
        comuniData: data.comuniData.map(feature => ({
            type: feature.type,
            properties: {
                p: feature.properties.pro_com_t,
                c: feature.properties.comune,
                d: feature.properties.den_uts,
                s: feature.properties.sigla,
                r: feature.properties.cod_reg,
                cd: feature.properties.candidature
            },
            geometry: feature.geometry
        })),
        candidatureData: data.candidatureData.map(row => ({
            r: row.regione,
            p: row.provincia,
            c: row.comune,
            cc: row.cod_comune,
            cup: row.codice_cup,
            a: row.avviso,
            dic: row.data_invio_candidatura,
            df: row.data_finanziamento,
            imp: row.importo_finanziamento
        }))
    };
    
    return optimized;
}

// Funzione per ripristinare i dati ottimizzati
function restoreOptimizedData(optimized) {
    return {
        comuniData: optimized.comuniData.map(feature => ({
            type: feature.type,
            properties: {
                pro_com_t: feature.properties.p,
                comune: feature.properties.c,
                den_uts: feature.properties.d,
                sigla: feature.properties.s,
                cod_reg: feature.properties.r,
                candidature: feature.properties.cd
            },
            geometry: feature.geometry
        })),
        candidatureData: optimized.candidatureData.map(row => ({
            regione: row.r,
            provincia: row.p,
            comune: row.c,
            cod_comune: row.cc,
            codice_cup: row.cup,
            avviso: row.a,
            data_invio_candidatura: row.dic,
            data_finanziamento: row.df,
            importo_finanziamento: row.imp
        }))
    };
}

// Funzione per comprimere i dati
function compressData(data) {
    try {
        // Ottimizza i dati prima della compressione
        const optimized = optimizeDataForStorage(data);
        const jsonString = JSON.stringify(optimized);
        
        // Rimuovi spazi bianchi non necessari
        let compressed = jsonString.replace(/\s+/g, ' ');
        
        return compressed;
    } catch (error) {
        console.error('Errore nella compressione dei dati:', error);
        return JSON.stringify(data);
    }
}

// Funzione per decomprimere i dati
function decompressData(compressedData) {
    try {
        const parsed = JSON.parse(compressedData);
        
        // Controlla se i dati sono ottimizzati
        if (parsed.comuniData && parsed.comuniData[0] && parsed.comuniData[0].properties.p) {
            return restoreOptimizedData(parsed);
        }
        
        return parsed;
    } catch (error) {
        console.error('Errore nella decompressione dei dati:', error);
        return null;
    }
}

// Funzione per pulire la cache
async function clearCache() {
    // Pulisci localStorage
    localStorage.removeItem('paDigitale2026Data');
    localStorage.removeItem('paDigitale2026Timestamp');
    
    // Pulisci IndexedDB
    try {
        const db = await initIndexedDB();
        const transaction = db.transaction(['data'], 'readwrite');
        const store = transaction.objectStore('data');
        const request = store.delete('paDigitale2026Data');
        
        request.onsuccess = () => {
            console.log('Dati rimossi da IndexedDB');
        };
        request.onerror = () => {
            console.error('Errore nella rimozione dei dati da IndexedDB');
        };
    } catch (error) {
        console.error('Errore nell\'inizializzazione di IndexedDB per la pulizia:', error);
    }
    
    // Ricarica i dati
    document.getElementById('loading').style.display = 'block';
    loadData();
}

// Inizializzazione ottimizzata
document.addEventListener('DOMContentLoaded', function() {
    // Setup menu mobile
    setupMobileMenu();
    
    initMap();
    loadData();
    setupTooltip();
    setupSearchFilters();
    
    // Event delegation per i filtri
    document.body.addEventListener('change', function(e) {
        if (e.target.matches('#regioneFilter, #regioneFilterMobile')) {
            currentFilters.regione = e.target.value;
            currentFilters.provincia = '';
            currentFilters.comune = '';
            resetSearchInputs();
            updateFilterValue('regioneFilter', e.target.value);
            updateFilterValue('regioneFilterMobile', e.target.value);
            updateFilterOptions();
            applyFilters();
        }
        
        if (e.target.matches('#avvisoFilter, #avvisoFilterMobile')) {
            currentFilters.avviso = e.target.value;
            updateFilterValue('avvisoFilter', e.target.value);
            updateFilterValue('avvisoFilterMobile', e.target.value);
            applyFilters();
        }
    });
    
    // Gestisce il resize per responsiveness del grafico
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            updateChart();
        }, 250);
        
        // Aggiorna la vista iniziale per il pulsante home
        clearTimeout(window.resizeMapTimeout);
        window.resizeMapTimeout = setTimeout(function() {
            const isMobile = window.innerWidth <= 992;
            const newInitialZoom = isMobile ? 5 : 6;
            const newInitialCenter = isMobile ? [42.5, 12.5] : [41.9028, 12.4964];
            
            // Aggiorna la vista iniziale per il pulsante home
            initialMapView.center = newInitialCenter;
            initialMapView.zoom = newInitialZoom;
        }, 250);
    });

    // Gestione chiusura modal con ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeDataModal();
            closeInfoModal();
        }
    });
});

// ========== FUNZIONI PER LA TABELLA DATI ==========

function openDataModal() {
    updateTableData();
    document.getElementById('dataModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDataModal() {
    document.getElementById('dataModal').classList.remove('active');
    document.body.style.overflow = '';
}

function updateTableData() {
    // Ottieni i dati filtrati
    currentTableData = getFilteredData();
    
    // Reset ordinamento e paginazione
    currentPage = 1;
    
    // Aggiorna conteggio record
    document.getElementById('tableRecordCount').textContent = 
        `${currentTableData.length} record trovati`;
    
    renderTable();
    renderPagination();
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    
    // Calcola record per la pagina corrente
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;
    const pageData = currentTableData.slice(startIndex, endIndex);
    
    pageData.forEach(record => {
        const row = document.createElement('tr');
        
        // Formatta le date
        const dataInvio = formatDate(record.data_invio_candidatura);
        const dataFinanziamento = formatDate(record.data_finanziamento);
        
        // Formatta l'importo
        const importo = formatCurrency(parseFloat(record.importo_finanziamento) || 0);
        
        // Tronca l'avviso se troppo lungo
        const avviso = record.avviso.length > 50 ? 
            record.avviso.substring(0, 50) + '...' : record.avviso;
        
        // Crea link per il codice CUP
        const cupLink = createCupLink(record.codice_cup);
        
        row.innerHTML = `
            <td title="${record.regione}">${record.regione}</td>
            <td title="${record.provincia}">${record.provincia}</td>
            <td title="${record.comune}">${record.comune}</td>
            <td title="${record.codice_cup}">${cupLink}</td>
            <td title="${record.avviso}">${avviso}</td>
            <td title="${dataInvio}">${dataInvio}</td>
            <td title="${dataFinanziamento}">${dataFinanziamento}</td>
            <td title="${importo}">${importo}</td>
        `;
        
        tbody.appendChild(row);
    });
}

function renderPagination() {
    const totalPages = Math.ceil(currentTableData.length / recordsPerPage);
    const pagination = document.getElementById('tablePagination');
    pagination.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // Bottone Precedente
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => changePage(currentPage - 1);
    pagination.appendChild(prevBtn);
    
    // Calcola range di pagine da mostrare
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Prima pagina se necessario
    if (startPage > 1) {
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-btn';
        firstBtn.textContent = '1';
        firstBtn.onclick = () => changePage(1);
        pagination.appendChild(firstBtn);
        
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'pagination-info';
            pagination.appendChild(ellipsis);
        }
    }
    
    // Pagine visibili
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = 'pagination-btn';
        if (i === currentPage) pageBtn.classList.add('active');
        pageBtn.textContent = i;
        pageBtn.onclick = () => changePage(i);
        pagination.appendChild(pageBtn);
    }
    
    // Ultima pagina se necessario
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'pagination-info';
            pagination.appendChild(ellipsis);
        }
        
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-btn';
        lastBtn.textContent = totalPages;
        lastBtn.onclick = () => changePage(totalPages);
        pagination.appendChild(lastBtn);
    }
    
    // Info pagina
    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `Pagina ${currentPage} di ${totalPages}`;
    pagination.appendChild(info);
    
    // Bottone Successivo
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => changePage(currentPage + 1);
    pagination.appendChild(nextBtn);
}

function changePage(page) {
    const totalPages = Math.ceil(currentTableData.length / recordsPerPage);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderTable();
        renderPagination();
        
        // Scroll to top della tabella
        document.querySelector('.table-container').scrollTop = 0;
    }
}

function sortTable(column) {
    // Rimuovi classi di ordinamento precedenti
    document.querySelectorAll('.data-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Determina direzione dell'ordinamento
    if (tableSortColumn === column) {
        tableSortDirection = tableSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        tableSortDirection = 'asc';
        tableSortColumn = column;
    }
    
    // Applica classe di ordinamento
    const header = document.querySelector(`th[onclick="sortTable('${column}')"]`);
    if (header) {
        header.classList.add(tableSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
    
    // Ordina i dati
    currentTableData.sort((a, b) => {
        let valueA = a[column] || '';
        let valueB = b[column] || '';
        
        // Gestione speciale per importi e date
        if (column === 'importo_finanziamento') {
            valueA = parseFloat(valueA) || 0;
            valueB = parseFloat(valueB) || 0;
        } else if (column.includes('data_')) {
            valueA = new Date(valueA);
            valueB = new Date(valueB);
        } else {
            valueA = valueA.toString().toLowerCase();
            valueB = valueB.toString().toLowerCase();
        }
        
        if (tableSortDirection === 'asc') {
            return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
        } else {
            return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
        }
    });
    
    // Reset alla prima pagina e re-render
    currentPage = 1;
    renderTable();
    renderPagination();
}

function downloadFilteredCSV() {
    if (currentTableData.length === 0) {
        alert('Nessun dato da scaricare');
        return;
    }

    // Colonne da includere nel CSV
    const columns = [
        'regione',
        'provincia', 
        'comune',
        'codice_cup',
        'avviso',
        'data_invio_candidatura',
        'data_finanziamento',
        'importo_finanziamento'
    ];

    const headers = [
        'Regione',
        'Provincia',
        'Comune', 
        'Codice CUP',
        'Avviso',
        'Data Invio Candidatura',
        'Data Finanziamento',
        'Importo Finanziamento'
    ];

    const csvContent = [
        headers.join(','),
        ...currentTableData.map(row => 
            columns.map(col => {
                const value = row[col] || '';
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(',')
        )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        
        // Nome file con info sui filtri
        let fileName = 'pa_digitale_2026_filtrati_';
        if (currentFilters.regione) fileName += `${currentFilters.regione.replace(/[^a-zA-Z0-9]/g, '_')}_`;
        if (currentFilters.provincia) fileName += `${currentFilters.provincia.replace(/[^a-zA-Z0-9]/g, '_')}_`;
        if (currentFilters.comune) fileName += `${currentFilters.comune.replace(/[^a-zA-Z0-9]/g, '_')}_`;
        fileName += `${new Date().toISOString().split('T')[0]}.csv`;
        
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('it-IT');
    } catch (e) {
        return dateString;
    }
}

// ========== FUNZIONI ORIGINALI (con ottimizzazioni) ==========

// Setup dei filtri con ricerca
function setupSearchFilters() {
    // Setup filtri provincia (desktop e mobile)
    setupSearchFilter('provinciaFilter', 'provinciaDropdown', 'provinciaClear', 'provincia');
    setupSearchFilter('provinciaFilterMobile', 'provinciaDropdownMobile', 'provinciaClearMobile', 'provincia');
    
    // Setup filtri comune (desktop e mobile)
    setupSearchFilter('comuneFilter', 'comuneDropdown', 'comuneClear', 'comune');
    setupSearchFilter('comuneFilterMobile', 'comuneDropdownMobile', 'comuneClearMobile', 'comune');
}

function setupSearchFilter(inputId, dropdownId, clearId, filterType) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const clearBtn = document.getElementById(clearId);
    
    if (!input || !dropdown || !clearBtn) return;
    
    let allOptions = [];
    
    // Input event per ricerca
    input.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        
        if (searchTerm.length > 0) {
            clearBtn.classList.add('show');
            const filteredOptions = allOptions.filter(option => 
                option.toLowerCase().includes(searchTerm)
            );
            showDropdown(dropdown, filteredOptions, filterType, input);
        } else {
            clearBtn.classList.remove('show');
            hideDropdown(dropdown);
        }
    });
    
    // Focus event per mostrare tutte le opzioni se input vuoto
    input.addEventListener('focus', function() {
        if (this.value.trim() === '' && allOptions.length > 0) {
            showDropdown(dropdown, allOptions, filterType, input);
        }
    });
    
    // Click fuori per nascondere dropdown
    document.addEventListener('click', function(e) {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown(dropdown);
        }
    });
    
    // Clear button
    clearBtn.addEventListener('click', function() {
        input.value = '';
        clearBtn.classList.remove('show');
        hideDropdown(dropdown);
        
        // Reset filtro
        if (filterType === 'provincia') {
            currentFilters.provincia = '';
            currentFilters.comune = '';
            // Clear anche l'altro input provincia
            const otherInput = inputId.includes('Mobile') ? 
                document.getElementById('provinciaFilter') : 
                document.getElementById('provinciaFilterMobile');
            if (otherInput) otherInput.value = '';
            
            // Clear anche comuni
            clearComuneInputs();
        } else if (filterType === 'comune') {
            currentFilters.comune = '';
            // Clear anche l'altro input comune
            const otherInput = inputId.includes('Mobile') ? 
                document.getElementById('comuneFilter') : 
                document.getElementById('comuneFilterMobile');
            if (otherInput) otherInput.value = '';
        }
        
        updateFilterOptions();
        applyFilters();
    });
    
    // Salva riferimento per aggiornare le opzioni
    input._updateOptions = function(options) {
        allOptions = options;
    };
}

function clearComuneInputs() {
    const comuneInputs = ['comuneFilter', 'comuneFilterMobile'];
    comuneInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
            const clearBtnId = id.replace('Filter', 'Clear');
            const clearBtn = document.getElementById(clearBtnId);
            if (clearBtn) clearBtn.classList.remove('show');
        }
    });
}

function showDropdown(dropdown, options, filterType, input) {
    dropdown.innerHTML = '';
    
    if (options.length === 0) {
        const noResultsOption = document.createElement('div');
        noResultsOption.className = 'filter-option no-results';
        noResultsOption.textContent = `Nessun${filterType === 'provincia' ? 'a provincia' : ' comune'} trovato`;
        dropdown.appendChild(noResultsOption);
    } else {
        options.forEach(option => {
            const optionElement = document.createElement('div');
            optionElement.className = 'filter-option';
            optionElement.textContent = option;
            optionElement.addEventListener('click', function() {
                input.value = option;
                
                if (filterType === 'provincia') {
                    currentFilters.provincia = option;
                    currentFilters.comune = '';
                    
                    // Aggiorna anche l'altro input provincia
                    const otherInput = input.id.includes('Mobile') ? 
                        document.getElementById('provinciaFilter') : 
                        document.getElementById('provinciaFilterMobile');
                    if (otherInput) otherInput.value = option;
                    
                    // Clear comuni
                    clearComuneInputs();
                } else if (filterType === 'comune') {
                    currentFilters.comune = option;
                    
                    // Aggiorna anche l'altro input comune
                    const otherInput = input.id.includes('Mobile') ? 
                        document.getElementById('comuneFilter') : 
                        document.getElementById('comuneFilterMobile');
                    if (otherInput) otherInput.value = option;
                }
                
                hideDropdown(dropdown);
                const clearBtnId = input.id.replace('Filter', 'Clear');
                const clearBtn = document.getElementById(clearBtnId);
                if (clearBtn) clearBtn.classList.add('show');
                
                updateFilterOptions();
                applyFilters();
            });
            dropdown.appendChild(optionElement);
        });
    }
    
    dropdown.classList.add('show');
}

function hideDropdown(dropdown) {
    dropdown.classList.remove('show');
}

// Funzione per configurare il menu mobile
function setupMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuClose = document.getElementById('mobileMenuClose');
    const mobileOverlay = document.getElementById('mobileOverlay');
    
    // Apri menu mobile
    mobileMenuToggle.addEventListener('click', function() {
        mobileMenu.classList.add('active');
        mobileOverlay.classList.add('active');
    });
    
    // Chiudi menu mobile
    function closeMobileMenu() {
        mobileMenu.classList.remove('active');
        mobileOverlay.classList.remove('active');
    }
    
    mobileMenuClose.addEventListener('click', closeMobileMenu);
    mobileOverlay.addEventListener('click', closeMobileMenu);
}

function initMap() {
    // Rilevamento dispositivo mobile
    const isMobile = window.innerWidth <= 992;
    
    // Zoom e centro adattati per mobile
    const initialZoom = isMobile ? 5 : 6;
    const initialCenter = isMobile ? [42.5, 12.5] : [41.9028, 12.4964];
    
    // Salva la vista iniziale nelle variabili globali
    initialMapView.center = initialCenter;
    initialMapView.zoom = initialZoom;
    
    // Bounds dell'Italia con margine
    const italyBounds = [
        [35.0, 5.0],  // Sud-Ovest (con margine)
        [48.0, 20.0]  // Nord-Est (con margine)
    ];

    map = L.map('map', {
        zoomControl: false, // Disabilita controlli di default
        maxBounds: italyBounds,
        maxBoundsViscosity: 0.8, // Permette un po' di elasticità   
        minZoom: 5,  // Permette di vedere tutta l'Italia
        maxZoom: 16
    }).setView(initialCenter, initialZoom);
    
    // Aggiungi controlli di zoom a destra
    L.control.zoom({
        position: 'topright'
    }).addTo(map);
    
    // Aggiungi il controllo home personalizzato
    const homeControl = L.Control.extend({
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            
            container.style.backgroundColor = 'white';
            container.style.backgroundImage = "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Im0zIDkgOS03IDkgN3YxMWEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnoiLz48cG9seWxpbmUgcG9pbnRzPSI5LDIyIDksMTIgMTUsMTIgMTUsMjIiLz48L3N2Zz4=')";
            container.style.backgroundSize = '60%';
            container.style.backgroundPosition = 'center';
            container.style.backgroundRepeat = 'no-repeat';
            container.style.width = '30px';
            container.style.height = '30px';
            container.style.cursor = 'pointer';
            container.style.border = '2px solid rgba(0,0,0,0.2)';
            container.style.borderRadius = '4px';
            container.title = 'Torna alla vista iniziale';
            
            container.onclick = function(){
                resetMapView();
            }
            
            // Previeni la propagazione degli eventi per evitare conflitti con la mappa
            L.DomEvent.disableClickPropagation(container);
            
            return container;
        },
        
        onRemove: function(map) {
            // Cleanup quando il controllo viene rimosso
        }
    });
    
    // Aggiungi il controllo home in alto a destra, sotto i controlli zoom
    map.addControl(new homeControl({position: 'topright'}));
    
    // Mappa CartoDB Dark per meglio integrarsi con il tema scuro
    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors, © CartoDB - <a href="https://twitter.com/gbvitrano" title="Giovan Battista Vitrano" target="_blank">@gbvitrano</a> - <a href="http://opendatasicilia.it/" title="opendatasicilia.it" target="_blank">opendatasicilia.it</a>',
        subdomains: 'abcd',
    }).addTo(map);
}

// Nuova funzione per resettare la vista della mappa
function resetMapView() {
    if (map && initialMapView.center && initialMapView.zoom) {
        map.setView(initialMapView.center, initialMapView.zoom);
        
        // Chiudi eventuali popup aperti
        map.closePopup();
        
        // Aggiorna anche la vista iniziale in caso di resize della finestra
        const isMobile = window.innerWidth <= 992;
        const newInitialZoom = isMobile ? 5 : 6;
        const newInitialCenter = isMobile ? [42.5, 12.5] : [41.9028, 12.4964];
        
        initialMapView.center = newInitialCenter;
        initialMapView.zoom = newInitialZoom;
        
        map.setView(newInitialCenter, newInitialZoom);
    }
}

function setupTooltip() {
    tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);
}

// Funzione per formattare i codici a 6 cifre con zeri iniziali
function formatTo6Digits(code) {
    let codeStr = String(code).trim();
    const numericValue = parseInt(codeStr, 10);
    if (!isNaN(numericValue)) {
        codeStr = numericValue.toString().padStart(6, '0');
    }
    return codeStr;
}

// Funzione loadData ottimizzata con caching e caricamento parallelo
async function loadData() {
    try {
        // Prima prova a caricare da localStorage
        const cachedData = localStorage.getItem('paDigitale2026Data');
        const cacheTimestamp = localStorage.getItem('paDigitale2026Timestamp');
        const now = new Date().getTime();
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 ore
        
        if (cachedData && cacheTimestamp && (now - parseInt(cacheTimestamp) < CACHE_DURATION)) {
            const decompressed = decompressData(cachedData);
            if (decompressed) {
                const { comuniData: cachedComuni, candidatureData: cachedCandidature } = decompressed;
                comuniData = cachedComuni;
                candidatureData = cachedCandidature;
                
                updateDebugInfo(`Dati caricati da cache (localStorage): ${comuniData.length} comuni, ${candidatureData.length} candidature`);
                
                // Continua con l'elaborazione
                joinData();
                createMapLayer();
                populateFilters();
                updateStats();
                updateChart();
                updateLastUpdateTime();
                
                document.getElementById('loading').style.display = 'none';
                return;
            }
        }
        
        // Se localStorage fallisce, prova IndexedDB
        const indexedDBData = await loadFromIndexedDB('paDigitale2026Data');
        if (indexedDBData && (now - indexedDBData.timestamp < CACHE_DURATION)) {
            const decompressed = decompressData(indexedDBData.data);
            if (decompressed) {
                const { comuniData: cachedComuni, candidatureData: cachedCandidature } = decompressed;
                comuniData = cachedComuni;
                candidatureData = cachedCandidature;
                
                updateDebugInfo(`Dati caricati da cache (IndexedDB): ${comuniData.length} comuni, ${candidatureData.length} candidature`);
                
                // Continua con l'elaborazione
                joinData();
                createMapLayer();
                populateFilters();
                updateStats();
                updateChart();
                updateLastUpdateTime();
                
                document.getElementById('loading').style.display = 'none';
                return;
            }
        }
        
        // Se non ci sono dati in cache, carica da remoto
        const [comuniResponse, candidatureResponse] = await Promise.all([
            fetch('https://palermohub.github.io/Pa-Digitale-2026/pmtiles/comuni_italiani_2025_2.json'),
            fetch('https://query.data.world/s/yxkuwlvmx4oxyngoeera3kf4awaje3?dws=00000')
        ]);
        
        if (!comuniResponse.ok || !candidatureResponse.ok) {
            throw new Error('Errore nel caricamento dei dati');
        }
        
        const comuniGeoJSON = await comuniResponse.json();
        comuniData = comuniGeoJSON.features;
        
        const candidatureCSV = await candidatureResponse.text();
        candidatureData = parseCSV(candidatureCSV);
        
        updateDebugInfo(`Comuni totali: ${comuniData.length}, Candidature: ${candidatureData.length}`);
        
        // Prepara i dati per il caching
        const dataToCache = {
            comuniData: comuniData,
            candidatureData: candidatureData
        };
        
        const compressedData = compressData(dataToCache);
        
        // Prova a salvare in localStorage
        try {
            localStorage.setItem('paDigitale2026Data', compressedData);
            localStorage.setItem('paDigitale2026Timestamp', now.toString());
            updateDebugInfo('Dati salvati in localStorage');
        } catch (localStorageError) {
            console.warn('LocalStorage quota exceeded, usando IndexedDB:', localStorageError);
            
            // Se localStorage fallisce, usa IndexedDB
            const indexedDBSuccess = await saveToIndexedDB('paDigitale2026Data', compressedData);
            if (indexedDBSuccess) {
                updateDebugInfo('Dati salvati in IndexedDB');
            } else {
                updateDebugInfo('Impossibile salvare i dati in cache');
            }
        }
        
        // Join dei dati
        joinData();
        
        // Crea layer mappa
        createMapLayer();
        
        // Popola filtri
        populateFilters();
        
        // Aggiorna statistiche e grafico
        updateStats();
        updateChart();
        
        // Aggiorna la data dell'ultimo aggiornamento
        updateLastUpdateTime();
        
        document.getElementById('loading').style.display = 'none';
    } catch (error) {
        console.error('Errore nel caricamento dei dati:', error);
        document.getElementById('loading').innerHTML = '<div style="color: #EF4444;">Errore nel caricamento dei dati</div>';
    }
}

// Funzione parseCSV ottimizzata
function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const headers = parseCSVLine(lines[0]);
    const data = [];
    
    // Pre-allocazione per migliorare le prestazioni
    data.length = lines.length - 1;
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = parseCSVLine(lines[i]);
            if (values.length >= headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    let value = values[index] || '';
                    
                    if (header === 'cod_comune' && value.trim()) {
                        value = formatTo6Digits(value);
                    }
                    
                    row[header] = value;
                });
                
                if (row.cod_comune && row.cod_comune.trim() && row.cod_comune !== '000000') {
                    data.push(row);
                }
            }
        }
    }
    
    return data;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

// Funzione joinData ottimizzata
function joinData() {
    const candidaturePerComune = {};
    
    // Costruisci una mappa per accesso diretto
    candidatureData.forEach(candidatura => {
        const codComune = candidatura.cod_comune;
        const importo = parseFloat(candidatura.importo_finanziamento) || 0;
        
        if (!candidaturePerComune[codComune]) {
            candidaturePerComune[codComune] = {
                candidature: [],
                totaleImporto: 0,
                numeroProgetti: 0,
                regione: candidatura.regione,
                provincia: candidatura.provincia,
                comune: candidatura.comune
            };
        }
        candidaturePerComune[codComune].candidature.push(candidatura);
        candidaturePerComune[codComune].totaleImporto += importo;
        candidaturePerComune[codComune].numeroProgetti++;
    });

    let joinCount = 0;
    comuniData.forEach(comune => {
        const codComuneJSON = comune.properties.pro_com_t;
        
        if (candidaturePerComune[codComuneJSON]) {
            comune.properties.candidature = candidaturePerComune[codComuneJSON];
            joinCount++;
        }
    });

    updateDebugInfo(`Join completato: ${joinCount} comuni matchati`);
}

// Funzione createMapLayer ottimizzata con rendering a chunk
function createMapLayer() {
    if (comuniLayer) {
        map.removeLayer(comuniLayer);
    }

    // Suddividi i dati in chunk per un rendering più fluido
    const chunkSize = 1000;
    const chunks = [];
    
    for (let i = 0; i < comuniData.length; i += chunkSize) {
        chunks.push(comuniData.slice(i, i + chunkSize));
    }

    // Crea il layer base
    comuniLayer = L.geoJSON([], {
        style: function(feature) {
            return getBaseStyle(feature);
        },
        onEachFeature: function(feature, layer) {
            layer.on({
                mouseover: function(e) {
                    const layer = e.target;
                    layer.setStyle({
                        weight: 2,
                        color: '#06B6D4',
                        opacity: 1,
                        fillOpacity: 1
                    });
                    
                    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                        layer.bringToFront();
                    }

                    showTooltip(e, feature.properties);
                },
                mouseout: function(e) {
                    e.target.setStyle(getBaseStyle(feature));
                    hideMapTooltip();
                },
                click: function(e) {
                    showComuneInfo(feature.properties);
                    currentFilters.comune = feature.properties.comune;
                    
                    // Aggiorna i filtri
                    updateFilterValue('comuneFilter', feature.properties.comune);
                    updateFilterValue('comuneFilterMobile', feature.properties.comune);
                    
                    applyFilters();
                    map.fitBounds(e.target.getBounds());
                }
            });
        }
    }).addTo(map);

    // Aggiungi i dati chunk per chunk per non bloccare l'UI
    chunks.forEach((chunk, index) => {
        setTimeout(() => {
            comuniLayer.addData(chunk);
        }, index * 50); // Piccolo ritardo tra ogni chunk
    });
}

function getBaseStyle(feature) {
    const codReg = feature.properties.cod_reg.toString();
    const hasCandidature = feature.properties.candidature;
    
    let matchesFilter = true;
    if (currentFilters.regione && feature.properties.candidature && 
        feature.properties.candidature.regione !== currentFilters.regione) {
        matchesFilter = false;
    }
    if (currentFilters.provincia && feature.properties.candidature && 
        feature.properties.candidature.provincia !== currentFilters.provincia) {
        matchesFilter = false;
    }
    if (currentFilters.comune && feature.properties.comune !== currentFilters.comune) {
        matchesFilter = false;
    }
    if (currentFilters.avviso && feature.properties.candidature) {
        let hasMatchingAvviso = false;
        feature.properties.candidature.candidature.forEach(c => {
            if (c.avviso === currentFilters.avviso) {
                hasMatchingAvviso = true;
            }
        });
        if (!hasMatchingAvviso) {
            matchesFilter = false;
        }
    }
    
    return {
        fillColor: regionColors[codReg] || '#64748B',
        weight: 0,
        opacity: 0,
        color: 'transparent',
        fillOpacity: (hasCandidature && matchesFilter) ? 0.8 : 0.2
    };
}

function showTooltip(e, properties) {
    const comune = properties.comune;
    const provincia = properties.den_uts;
    const candidature = properties.candidature;
    
    let content = `<strong>${comune}</strong><br/>Provincia: ${provincia}`;
    
    if (candidature) {
        content += `<br/>Progetti: ${candidature.numeroProgetti}`;
        content += `<br/>Importo: €${candidature.totaleImporto.toLocaleString('it-IT')}`;
    } else {
        content += '<br/>Nessun progetto finanziato';
    }

    tooltip.transition()
        .duration(200)
        .style('opacity', 0.9);
    tooltip.html(content)
        .style('left', (e.originalEvent.pageX + 10) + 'px')
        .style('top', (e.originalEvent.pageY - 28) + 'px');
}

function hideMapTooltip() {
    tooltip.transition()
        .duration(500)
        .style('opacity', 0);
}

function showComuneInfo(properties) {
    let popupContent = `
        <div style="color: #2c3e50; font-family: 'Inter', sans-serif; min-width: 400px;">
            <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 12px; margin: -16px -16px 16px -16px; border-radius: 12px 12px 0 0;">
                <h4 style="margin: 0; font-size: 16px; font-weight: 600;">🏛️ ${properties.comune}</h4>
                <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">${properties.den_uts} (${properties.sigla})</div>
            </div>
    `;
    
    if (properties.candidature) {
        popupContent += `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div style="background: #f8fafc; padding: 8px; border-radius: 8px; text-align: center; border-left: 3px solid #10b981;">
                    <div style="font-size: 18px; font-weight: 700; color: #10b981;">${properties.candidature.numeroProgetti}</div>
                    <div style="font-size: 11px; color: #64748b;">Progetti</div>
                </div>
                <div style="background: #f8fafc; padding: 8px; border-radius: 8px; text-align: center; border-left: 3px solid #3b82f6;">
                    <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">€${properties.candidature.totaleImporto.toLocaleString('it-IT')}</div>
                    <div style="font-size: 11px; color: #64748b;">Importo totale</div>
                </div>
            </div>
            
            <div style="margin-top: 16px;">
                <h5 style="margin: 0 0 12px 0; font-size: 14px; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;"><i class='fa-solid fa-list'></i> Dettaglio Progetti</h5>
                <div style="max-height: 420px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background: #f1f5f9;">
                                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #cbd5e1;">CUP</th>
                                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #cbd5e1;">Avviso</th>
                                <th style="padding: 8px 4px; text-align: right; font-weight: 600; color: #475569; border-bottom: 2px solid #cbd5e1;">Importo</th>
                                <th style="padding: 8px 4px; text-align: center; font-weight: 600; color: #475569; border-bottom: 2px solid #cbd5e1;">Data</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        // Ordina le candidature per importo decrescente
        const candidatureOrdered = [...properties.candidature.candidature].sort((a, b) => 
            (parseFloat(b.importo_finanziamento) || 0) - (parseFloat(a.importo_finanziamento) || 0)
        );
        
        candidatureOrdered.forEach((candidatura, index) => {
            const importo = parseFloat(candidatura.importo_finanziamento) || 0;
            const avvisoShort = candidatura.avviso.length > 30 ? 
                candidatura.avviso.substring(0, 30) + '...' : candidatura.avviso;
            const dataFinanziamento = candidatura.data_finanziamento ? 
                new Date(candidatura.data_finanziamento).toLocaleDateString('it-IT') : '-';
            const cupCode = candidatura.codice_cup || '-';
            
            const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
            
            // Crea il link CUP per il popup - versione semplificata per HTML inline
            let cupDisplay = cupCode;
            if (cupCode && cupCode !== '-' && cupCode.trim() !== '') {
                const cupUrl = 'https://www.opencup.gov.it/portale/it/web/opencup/home/progetto/-/cup/' + encodeURIComponent(cupCode);
                cupDisplay = `<a href="${cupUrl}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: none; font-weight: 500;" title="Apri dettaglio progetto OpenCUP">${cupCode}</a>`;
            }
            
            popupContent += `
                <tr style="background: ${rowBg}; transition: background 0.2s;">
                    <td style="padding: 8px 4px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 10px; color: #6366f1;" title="${cupCode}">${cupDisplay}</td>
                    <td style="padding: 8px 4px; border-bottom: 1px solid #e2e8f0; line-height: 1.3;" title="${candidatura.avviso}">${avvisoShort}</td>
                    <td style="padding: 8px 4px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #059669;">€${importo.toLocaleString('it-IT')}</td>
                    <td style="padding: 8px 4px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #64748b;">${dataFinanziamento}</td>
                </tr>
            `;
        });
        
        popupContent += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        popupContent += `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="color: #dc2626; font-weight: 500;">Nessun progetto finanziato</div>
                <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">Questo comune non ha candidature confermate</div>
            </div>
        `;
    }
    
    popupContent += '</div>';
    
    let comuneLayer = null;
    comuniLayer.eachLayer(function(layer) {
        if (layer.feature.properties.comune === properties.comune) {
            comuneLayer = layer;
        }
    });
    
    if (comuneLayer) {
        const bounds = comuneLayer.getBounds();
        const center = bounds.getCenter();
        
        L.popup({
            maxWidth: 500,
            className: 'comune-popup',
            autoPan: true,
            autoPanPadding: [20, 20]
        })
        .setLatLng(center)
        .setContent(popupContent)
        .openOn(map);
    }
}

function populateFilters() {
    updateFilterOptions();
    
    // Event listeners per filtri regione (gestiti tramite event delegation)
    // Event listeners per filtri avviso (gestiti tramite event delegation)
}

// Funzione applyFilters ottimizzata
function applyFilters() {
    // Mostra un indicatore di caricamento
    document.getElementById('loading').style.display = 'block';
    
    // Utilizza requestAnimationFrame per non bloccare l'UI
    requestAnimationFrame(() => {
        // Aggiorna lo stile dei layer della mappa
        if (comuniLayer) {
            comuniLayer.eachLayer(function(layer) {
                layer.setStyle(getBaseStyle(layer.feature));
            });
        }
        
        // Aggiorna le statistiche
        updateStats();
        
        // Aggiorna il grafico (con debounce già implementato)
        updateChart();
        
        // Aggiorna il pannello info se necessario
        if (currentFilters.comune) {
            const comuneData = comuniData.find(c => c.properties.comune === currentFilters.comune);
            if (comuneData) {
                showComuneInfo(comuneData.properties);
            }
        }
        
        // Nascondi l'indicatore di caricamento
        document.getElementById('loading').style.display = 'none';
    });
}

// Funzione updateChart con debounce - CORRETTA
function updateChart() {
    // Cancella il timeout precedente se esiste
    clearTimeout(chartUpdateTimeout);
    
    // Imposta un nuovo timeout per ritardare l'aggiornamento
    chartUpdateTimeout = setTimeout(() => {
        const filteredData = getFilteredData();
        
        // Ottieni il tipo di grafico attivo
        const activeTab = document.querySelector('.chart-tab.active');
        const chartType = activeTab ? activeTab.id.replace('tab-', '') : 'dynamic';
        
        // Rimuovi il grafico precedente
        d3.select("#chart").selectAll("*").remove();
        
        // Imposta dimensioni
        const container = document.querySelector('.chart-container');
        const containerWidth = container.clientWidth;
        const containerHeight = Math.min(580, container.clientHeight);
        
        // DEFINISCI margin qui
        const margin = { top: 20, right: 30, bottom: 60, left: 60 };
        const width = containerWidth - margin.left - margin.right;
        const height = containerHeight - margin.top - margin.bottom;
        
        const svg = d3.select("#chart")
            .attr("width", containerWidth)
            .attr("height", containerHeight);
        
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        // Prepara i dati in base al tipo di grafico
        let chartData;
        if (chartType === 'dynamic') {
            chartData = prepareChartData(filteredData);
        } else if (chartType === 'comuni') {
            chartData = prepareComuniChartData(filteredData);
        } else if (chartType === 'avvisi') {
            chartData = prepareAvvisiChartData(filteredData);
        }
        
        // Disegna il grafico verticale
        drawVerticalBarChart(g, chartData, width, height);
        
        // Aggiorna titolo
        updateChartTitle(chartType);
    }, 300); // Ritardo di 300ms
}

// Funzione per disegnare il grafico a barre VERTICALE
function drawVerticalBarChart(g, data, width, height) {
    if (data.length === 0) {
        g.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .style("fill", "#CBD5E1")
            .text("Nessun dato disponibile");
        return;
    }
    
    // Scala per l'asse X (valori numerici)
    const x = d3.scaleLinear()
        .range([0, width])
        .domain([0, d3.max(data, d => d.totaleImporto)]);
    
    // Scala per l'asse Y (categorie)
    const y = d3.scaleBand()
        .range([height, 0])
        .padding(0.1)
        .domain(data.map(d => d.regione || d.comune || d.avviso));
    
    // Aggiungi le barre
    g.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", 0)
        .attr("y", d => y(d.regione || d.comune || d.avviso))
        .attr("width", 0)
        .attr("height", y.bandwidth())
        .attr("fill", (d, i) => {
            const regionCode = regionNameToCode[d.regione] || (i % 20 + 1).toString();
            return regionColors[regionCode] || '#64748B';
        })
        .on("mouseover", function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("fill", d3.rgb(d3.select(this).attr("fill")).brighter(0.3));
            
            const tooltip = d3.select("body").append("div")
                .attr("class", "tooltip")
                .style("opacity", 0);
            
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            
            tooltip.html(`
                <strong>${d.regione || d.comune || d.avviso}</strong><br/>
                Importo: €${d.totaleImporto.toLocaleString('it-IT')}<br/>
                Progetti: ${d.numeroProgetti}
            `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("fill", d3.rgb(d3.select(this).attr("fill")).darker(0.3));
            
            d3.selectAll(".tooltip").remove();
        })
        .transition()
        .duration(800)
        .attr("width", d => x(d.totaleImporto));
    
    // Aggiungi l'asse X (valori)
    g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d => `€${(d / 1000000).toFixed(0)}M`))
        .selectAll("text")
        .style("font-size", "10px")
        .style("fill", "#CBD5E1");
    
    // Aggiungi l'asse Y (categorie)
    g.append("g")
        .call(d3.axisLeft(y))
        .selectAll("text")
        .style("font-size", "10px")
        .style("fill", "#CBD5E1");
    
    // Aggiungi etichetta asse X
    g.append("text")
        .attr("transform", `translate(${width / 2}, ${height + 50})`)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("fill", "#E2E8F0")
        .text("Importo (€)");
    
    // Aggiungi etichetta asse Y
    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - 60)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("fill", "#E2E8F0")
        .text("Categorie");
}

// Funzione per formattare la valuta
function formatCurrency(value) {
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

// Funzione per ottenere i dati filtrati
function getFilteredData() {
    return candidatureData.filter(candidatura => {
        if (currentFilters.regione && candidatura.regione !== currentFilters.regione) return false;
        if (currentFilters.provincia && candidatura.provincia !== currentFilters.provincia) return false;
        if (currentFilters.comune && candidatura.comune !== currentFilters.comune) return false;
        if (currentFilters.avviso && candidatura.avviso !== currentFilters.avviso) return false;
        return true;
    });
}

// Funzione per preparare i dati del grafico
function prepareChartData(data) {
    const regioniData = {};
    
    data.forEach(candidatura => {
        const regione = candidatura.regione;
        const importo = parseFloat(candidatura.importo_finanziamento) || 0;
        
        if (!regioniData[regione]) {
            regioniData[regione] = {
                regione: regione,
                totaleImporto: 0,
                numeroProgetti: 0
            };
        }
        regioniData[regione].totaleImporto += importo;
        regioniData[regione].numeroProgetti++;
    });
    
    return Object.values(regioniData).sort((a, b) => b.totaleImporto - a.totaleImporto);
}

// Funzione per preparare i dati del grafico per comune
function prepareComuniChartData(data) {
    const comuniData = {};
    
    data.forEach(candidatura => {
        const comune = candidatura.comune;
        const importo = parseFloat(candidatura.importo_finanziamento) || 0;
        
        if (!comuniData[comune]) {
            comuniData[comune] = {
                comune: comune,
                totaleImporto: 0,
                numeroProgetti: 0
            };
        }
        comuniData[comune].totaleImporto += importo;
        comuniData[comuni].numeroProgetti++;
    });
    
    return Object.values(comuniData).sort((a, b) => b.totaleImporto - a.totaleImporto).slice(0, 20);
}

// Funzione per preparare i dati del grafico per avvisi
function prepareAvvisiChartData(data) {
    const avvisiData = {};
    
    data.forEach(candidatura => {
        const avviso = candidatura.avviso;
        const importo = parseFloat(candidatura.importo_finanziamento) || 0;
        
        if (!avvisiData[avviso]) {
            avvisiData[avviso] = {
                avviso: avviso,
                totaleImporto: 0,
                numeroProgetti: 0
            };
        }
        avvisiData[avviso].totaleImporto += importo;
        avvisiData[avviso].numeroProgetti++;
    });
    
    return Object.values(avvisiData).sort((a, b) => b.totaleImporto - a.totaleImporto);
}

// Funzione per aggiornare il titolo del grafico
function updateChartTitle(chartType) {
    const titleElement = document.getElementById('chartTitle');
    const titles = {
        'dynamic': '<i class="fa-solid fa-euro-sign"></i> Importi finanziati per regione',
        'comuni': '<i class="fa-solid fa-city"></i> Top 20 Comuni per importo',
        'avvisi': '<i class="fa-solid fa-bullhorn"></i> Importi finanziati per avviso'
    };
    
    titleElement.innerHTML = titles[chartType] || titles['dynamic'];
}

// Funzione per aggiornare le statistiche
function updateStats() {
    const filteredData = getFilteredData();
    
    // Calcola le statistiche
    const regioniUniche = new Set(filteredData.map(d => d.regione)).size;
    const comuniUnici = new Set(filteredData.map(d => d.comune)).size;
    const numeroProgetti = filteredData.length;
    const importoTotale = filteredData.reduce((sum, d) => sum + (parseFloat(d.importo_finanziamento) || 0), 0);
    
    // Aggiorna l'interfaccia
    document.getElementById('statRegioni').textContent = regioniUniche;
    document.getElementById('statComuni').textContent = comuniUnici;
    document.getElementById('statProgetti').textContent = numeroProgetti;
    document.getElementById('statImporto').textContent = formatCurrency(importoTotale);
}

// Funzione per aggiornare le opzioni dei filtri
function updateFilterOptions() {
    // Ottieni i dati filtrati
    const filteredData = getFilteredData();
    
    // Popola le regioni
    const regioni = [...new Set(candidatureData.map(d => d.regione))].sort();
    populateSelect('regioneFilter', regioni);
    populateSelect('regioneFilterMobile', regioni);
    
    // Popola le province in base alla regione selezionata
    let province = [];
    if (currentFilters.regione) {
        province = [...new Set(candidatureData
            .filter(d => d.regione === currentFilters.regione)
            .map(d => d.province))].sort();
    } else {
        province = [...new Set(candidatureData.map(d => d.province))].sort();
    }
    
    // Aggiorna i filtri di ricerca per province
    updateSearchFilterOptions('provinciaFilter', province);
    updateSearchFilterOptions('provinciaFilterMobile', province);
    
    // Popola i comuni in base alla regione e provincia selezionati
    let comuni = [];
    if (currentFilters.regione && currentFilters.provincia) {
        comuni = [...new Set(candidatureData
            .filter(d => d.regione === currentFilters.regione && d.province === currentFilters.provincia)
            .map(d => d.comune))].sort();
    } else if (currentFilters.regione) {
        comuni = [...new Set(candidatureData
            .filter(d => d.regione === currentFilters.regione)
            .map(d => d.comune))].sort();
    } else if (currentFilters.provincia) {
        comuni = [...new Set(candidatureData
            .filter(d => d.province === currentFilters.provincia)
            .map(d => d.comune))].sort();
    } else {
        comuni = [...new Set(candidatureData.map(d => d.comune))].sort();
    }
    
    // Aggiorna i filtri di ricerca per comuni
    updateSearchFilterOptions('comuneFilter', comuni);
    updateSearchFilterOptions('comuneFilterMobile', comuni);
    
    // Popola gli avvisi
    const avvisi = [...new Set(candidatureData.map(d => d.avviso))].sort();
    populateSelect('avvisoFilter', avvisi);
    populateSelect('avvisoFilterMobile', avvisi);
}

// Funzione per popolare una select
function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">Tutti</option>';
    
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        select.appendChild(optionElement);
    });
    
    // Ripristina il valore selezionato se ancora disponibile
    if (options.includes(currentValue)) {
        select.value = currentValue;
    }
}

// Funzione per aggiornare le opzioni dei filtri di ricerca
function updateSearchFilterOptions(inputId, options) {
    const input = document.getElementById(inputId);
    if (!input || !input._updateOptions) return;
    
    input._updateOptions(options);
}

// Funzione per aggiornare il valore di un filtro
function updateFilterValue(filterId, value) {
    const filter = document.getElementById(filterId);
    if (filter) {
        filter.value = value;
        
        // Aggiorna il pulsante clear se necessario
        const clearBtnId = filterId.replace('Filter', 'Clear');
        const clearBtn = document.getElementById(clearBtnId);
        if (clearBtn) {
            if (value) {
                clearBtn.classList.add('show');
            } else {
                clearBtn.classList.remove('show');
            }
        }
    }
}

// Funzione per resettare i filtri
function resetFilters() {
    currentFilters = {
        regione: '',
        provincia: '',
        comune: '',
        avviso: ''
    };
    
    // Resetta i valori dei filtri
    document.getElementById('regioneFilter').value = '';
    document.getElementById('regioneFilterMobile').value = '';
    document.getElementById('provinciaFilter').value = '';
    document.getElementById('provinciaFilterMobile').value = '';
    document.getElementById('comuneFilter').value = '';
    document.getElementById('comuneFilterMobile').value = '';
    document.getElementById('avvisoFilter').value = '';
    document.getElementById('avvisoFilterMobile').value = '';
    
    // Nascondi i pulsanti clear
    document.getElementById('provinciaClear').classList.remove('show');
    document.getElementById('provinciaClearMobile').classList.remove('show');
    document.getElementById('comuneClear').classList.remove('show');
    document.getElementById('comuneClearMobile').classList.remove('show');
    
    // Nascondi i dropdown
    hideDropdown(document.getElementById('provinciaDropdown'));
    hideDropdown(document.getElementById('provinciaDropdownMobile'));
    hideDropdown(document.getElementById('comuneDropdown'));
    hideDropdown(document.getElementById('comuneDropdownMobile'));
    
    // Aggiorna le opzioni e applica i filtri
    updateFilterOptions();
    applyFilters();
}

// Funzione per resettare gli input di ricerca
function resetSearchInputs() {
    document.getElementById('provinciaFilter').value = '';
    document.getElementById('provinciaFilterMobile').value = '';
    document.getElementById('comuneFilter').value = '';
    document.getElementById('comuneFilterMobile').value = '';
    
    // Nascondi i pulsanti clear
    document.getElementById('provinciaClear').classList.remove('show');
    document.getElementById('provinciaClearMobile').classList.remove('show');
    document.getElementById('comuneClear').classList.remove('show');
    document.getElementById('comuneClearMobile').classList.remove('show');
    
    // Nascondi i dropdown
    hideDropdown(document.getElementById('provinciaDropdown'));
    hideDropdown(document.getElementById('provinciaDropdownMobile'));
    hideDropdown(document.getElementById('comuneDropdown'));
    hideDropdown(document.getElementById('comuneDropdownMobile'));
}

// Funzione per aggiornare le informazioni di debug
function updateDebugInfo(message) {
    const debugContent = document.getElementById('debugContent');
    const debugContentMobile = document.getElementById('debugContentMobile');
    
    if (debugContent) debugContent.textContent = message;
    if (debugContentMobile) debugContentMobile.textContent = message;
}

// Funzione per aggiornare la data dell'ultimo aggiornamento
function updateLastUpdateTime() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('it-IT') + ' ' + now.toLocaleTimeString('it-IT');
    
    document.getElementById('lastUpdate').textContent = formattedDate;
    document.getElementById('lastUpdateMobile').textContent = formattedDate;
}

// Funzione per cambiare la tab del grafico
function switchChartTab(tabType) {
    // Rimuovi la classe active da tutte le tab
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Aggiungi la classe active alla tab selezionata
    document.getElementById(`tab-${tabType}`).classList.add('active');
    
    // Aggiorna il grafico
    updateChart();
}