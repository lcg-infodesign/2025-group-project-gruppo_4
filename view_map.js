// --- FUNZIONE PRINCIPALE (ORCHESTRATOR) ---

let lineCoordinatesMap; 

function inizializzaMappa(city) {
    // 1. Pulizia e Setup Stato
    if (typeof mappa !== 'undefined' && mappa) {
        mappa.remove();
        mappa = null;
    }
    vistaAttuale = "mappa";
    appState.activeCityId = city.id;
    appState.isolatedLineId = null;
    stopAnimation();
    document.title = `${city.name} - Metro World`; 
    aggiornaURL(city.id);

    calcolaRangeAnni(city.id);

    let container = select("#app-container");
    container.html("");

    creaNavbar(container, city);
    
    let contentWrapper = createDiv().parent(container).class("flex flex-col lg:flex-row h-[75vh] gap-4");
    
    let mapWrapper = creaContenitoreMappa(contentWrapper); 
    let sidebar = creaSidebar(contentWrapper, city);       
    creaTimeline(container);                               

    lineCoordinatesMap = new Map(); 
    avviaMapbox(city, mapWrapper, lineCoordinatesMap);
}

// --- MODULO 1: UTILITY & CALCOLI ---
function aggiornaURL(cityId) {
    if (window.history.pushState) {
        let newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + `?city_id=${cityId}`;
        window.history.pushState({ path: newurl }, "", newurl);
    }
}

function calcolaRangeAnni(cityId) {
    let cityLines = db.lines.filter((l) => l.city_id === cityId);
    let firstEventYear = 2025;
    let hasValidYears = false;
    let lineIds = new Set(cityLines.map((l) => l.id));

    let filteredSectionLines = db.section_lines.filter((sl) => sl.city_id === cityId && lineIds.has(sl.line_id));
    let validSectionIds = new Set(filteredSectionLines.map((sl) => sl.section_id));
    let citySections = db.sections.filter((s) => validSectionIds.has(s.id));

    for (let s of citySections) {
        let b = parseYear(s.buildstart);
        let o = parseYear(s.opening);
        if (b && b > 1800 && b < firstEventYear) { firstEventYear = b; hasValidYears = true; }
        if (o && o > 1800 && o < firstEventYear) { firstEventYear = o; hasValidYears = true; }
    }

    appState.maxYear = 2025;
    
    // Salviamo questo stato per usarlo nella creazione UI
    appState.hasValidHistory = hasValidYears;

    if (!hasValidYears) {
        // NESSUN DATO STORICO: Iniziamo direttamente dalla fine
        appState.minYear = 2000; // Valore dummy
       appState.currentYear = appState.maxYear; 
    } else {
        // ABBIAMO DATI: Comportamento normale
        appState.minYear = firstEventYear - 1;
        appState.currentYear = appState.minYear;
    }
}

// --- MODULO 2: UI BUILDING BLOCKS ---

function creaNavbar(container, city) {
    let navBar = createDiv().parent(container).class("flex items-center justify-between mb-4 pb-2 border-b border-slate-100");
    let btnBack = createButton("Torna indietro");
    btnBack.parent(navBar).class("bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-50 font-medium transition-colors text-sm");
    btnBack.mousePressed(creaListaCitta);

    let titleContainer = createDiv().parent(navBar).class("text-right");
    createElement("h2", city.name).parent(titleContainer).class("text-3xl font-extrabold text-slate-800 tracking-tight");
    createElement("div", city.country).parent(titleContainer).class("text-sm text-slate-500 font-semibold uppercase tracking-wider");
}

function creaContenitoreMappa(parentWrapper) {
    // Wrapper principale (relativo)
    let wrapper = createDiv().parent(parentWrapper);
    wrapper.class("w-full lg:w-3/4 h-full rounded-xl overflow-hidden shadow-lg relative border border-slate-200 bg-slate-50");

    // 1. IL LOADER (Visibile subito)
    let loaderDiv = createDiv().parent(wrapper);
    loaderDiv.id("map-loader");
    loaderDiv.class("absolute inset-0 flex flex-col items-center justify-center z-10 bg-white transition-opacity duration-500");
    
    // --- SPINNER CON TAILWIND ---
    let spinner = createDiv().parent(loaderDiv);
    spinner.class("w-12 h-12 border-8 border-slate-200 border-t-indigo-600 rounded-full animate-spin mb-4");

    // Testo sotto lo spinner
    createSpan("Loading map...").parent(loaderDiv).class("text-slate-400 text-sm font-semibold tracking-wide uppercase");

    // 2. LA MAPPA (Invisibile all'inizio)
    let mapDivNativo = document.createElement("div");
    mapDivNativo.id = "map";
    mapDivNativo.className = "absolute inset-0 w-full h-full opacity-0 transition-opacity duration-1000"; 
    
    wrapper.elt.appendChild(mapDivNativo);
    mappaContainer = select("#map");

    return wrapper;
}

function creaSidebar(parentWrapper, city) {
    let sidebar = createDiv().parent(parentWrapper);
    sidebar.class("w-full lg:w-1/4 h-full bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col");

    // Header Sidebar
    let sbHeader = createDiv().parent(sidebar).class("p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl flex justify-between items-center");
    createSpan("Sistemi & Linee").parent(sbHeader).class("font-bold text-slate-700");
    let btnReset = createButton("Mostra tutto").parent(sbHeader);
    btnReset.class("text-xs bg-white border border-slate-300 px-2 py-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer");
    btnReset.mousePressed(() => resetFiltriMappa());

    // Contenuto Sidebar
    let sbContent = createDiv().parent(sidebar).class("flex-1 overflow-y-auto p-2");
    
    // Popolamento Linee
    let datiCitta = getDatiCitta(city.id);
    if (datiCitta.length === 0) {
        createP("Nessuna linea trovata.").parent(sbContent).class("p-4 text-slate-500 italic");
        return sidebar;
    }

    for (let system of datiCitta) {
        costruisciSistemaUI(system, sbContent);
    }
    
    updateSidebarStats();
    return sidebar;
}

function costruisciSistemaUI(system, container) {
    let sysDetail = createElement("details").parent(container).class("group mb-2");
    sysDetail.attribute("open", "true");
    
    let sysSummary = createElement("summary").parent(sysDetail);
    sysSummary.class("cursor-pointer font-bold text-slate-800 p-2 bg-slate-100 rounded hover:bg-slate-200 select-none flex justify-between items-center");
    createSpan(system.name).parent(sysSummary);
    
    let badge = createSpan(`${system.lines.length} linee`);
    badge.parent(sysSummary).class("text-xs font-normal text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 ml-2");

    let linesDiv = createDiv().parent(sysDetail).class("pl-2 mt-1 space-y-1");

    for (let line of system.lines) {
        costruisciLineaUI(line, linesDiv);
    }
}

function costruisciLineaUI(line, container) {
    let lineDetail = createElement("details").parent(container).class("group/line");
    let lineSummary = createElement("summary").parent(lineDetail);
    lineSummary.class("cursor-pointer p-2 rounded hover:bg-slate-50 text-sm flex flex-col items-start gap-1 select-none transition-colors");

    let headerLine = createDiv().parent(lineSummary).class("flex items-center gap-2 w-full");
    let hexColor = fixColor(line.color);
    createSpan("").parent(headerLine).class("w-3 h-3 rounded-full shadow-sm block flex-shrink-0").style("background-color", hexColor);
    createSpan(line.name).parent(headerLine).class("font-medium text-slate-700");

    let statsContainer = createDiv().parent(lineSummary);
    statsContainer.id(`line-stats-${line.id}`);
    statsContainer.class("flex flex-wrap gap-1 ml-5 mt-1");

    let stationsDiv = createDiv().parent(lineDetail);
    stationsDiv.id(`stations-list-${line.id}`);
    stationsDiv.class("pl-6 border-l-2 border-slate-100 ml-3 mt-1 space-y-1");
}

/**
 * Popola l'elenco delle stazioni per ogni linea, dopo che i dati delle coordinate sono pronti.
 * Questa funzione viene chiamata dopo l'avvio della mappa.
 */
function popolaStazioniUI(cityId) {
    let datiCitta = getDatiCitta(cityId);
    for (let system of datiCitta) {
        for (let line of system.lines) {
            let stationsDiv = select(`#stations-list-${line.id}`);
            if (!stationsDiv) continue;

            // Puliamo il contenitore per evitare duplicati se chiamato più volte
            stationsDiv.html("");

            if (line.stations.length > 0) {
                // --- ORDINAMENTO GEOGRAFICO AVANZATO ---
                // Usa la logica del Baricentro + Backtracking
                let sortedStations = ordinaStazioniNaturalmente(line.stations);

                let btnShowLine = createDiv("Isola linea").parent(stationsDiv);
                btnShowLine.class("text-xs font-bold text-indigo-600 cursor-pointer py-1 mb-1 hover:underline");
                btnShowLine.mousePressed(() => isolaLineaSullaMappa(line.id));

                for (let station of sortedStations) {
                    let stElem = createDiv(station.name).parent(stationsDiv);
                    stElem.class("text-xs text-slate-600 hover:text-indigo-600 cursor-pointer py-1 truncate");
                    stElem.mousePressed(() => zoomSuStazione(station));
                }
            } else {
                createDiv("Nessuna stazione.").parent(stationsDiv).class("text-xs text-slate-400 italic py-1");
            }
        }
    }
}

function creaTimeline(container) {
    let timelineWrapper = createDiv().parent(container).class("mt-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-4");
    
    if (!appState.hasValidHistory) {
        timelineWrapper.class("mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 italic text-sm");
        timelineWrapper.html("Dati storici di costruzione non disponibili per questa città.");
        return;
    }

    let tlInfo = createDiv().parent(timelineWrapper).class("w-full md:w-1/6 flex flex-col justify-center");
    createSpan("EVOLUZIONE RETE").parent(tlInfo).class("block text-[10px] font-bold text-slate-400 uppercase tracking-widest");
    let yearDisplay = createElement("h3", appState.minYear).parent(tlInfo).class("text-3xl font-black text-indigo-600 tabular-nums");

    let sliderContainer = createDiv().parent(timelineWrapper).class("w-full md:w-5/6 flex items-center gap-4 px-2");
    
    // Bottone Play
    let btnPlay = createButton("PLAY").parent(sliderContainer);
    btnPlay.id("btn-play");
    btnPlay.attribute("disabled", "true");
    btnPlay.class("w-16 h-10 flex-shrink-0 bg-slate-200 text-slate-400 rounded-md flex items-center justify-center font-bold text-xs cursor-not-allowed transition-colors tracking-wider");
    btnPlay.mousePressed(() => togglePlayback());

    let sliderWrapper = createDiv().parent(sliderContainer).class("flex-grow relative");
    
    // Slider
    let slider = createElement("input").parent(sliderWrapper);
    slider.id("timeline-slider");
    slider.attribute("type", "range");
    slider.attribute("min", appState.minYear);
    slider.attribute("max", appState.maxYear);
    slider.attribute("value", appState.minYear);
    slider.attribute("step", "1");
    slider.attribute("disabled", "true");
    slider.class("w-full metro-slider cursor-not-allowed opacity-50 grayscale");

    let labels = createDiv().parent(sliderWrapper).class("flex justify-between text-xs text-slate-400 font-bold mt-1 uppercase");
    createSpan(appState.minYear).parent(labels);
    createSpan(appState.maxYear).parent(labels);

    slider.input(() => {
        let val = parseInt(slider.value());
        appState.currentYear = val;
        yearDisplay.html(val);
        aggiornaFiltriCombinati();
        if (appState.isPlaying) togglePlayback(false);
    });
}

function sbloccaControlliTimeline() {
    let btnPlay = select("#btn-play");
    if (btnPlay) {
        btnPlay.removeAttribute("disabled");
        btnPlay.class("w-16 h-10 flex-shrink-0 bg-indigo-600 text-white rounded-md flex items-center justify-center font-bold text-xs hover:bg-indigo-700 transition-colors cursor-pointer tracking-wider");
    }

    let slider = select("#timeline-slider");
    if (slider) {
        slider.removeAttribute("disabled");
        slider.class("w-full metro-slider cursor-pointer");
    }
}

// --- MODULO 3: MAPBOX LOGIC & ANIMATION ---

function avviaMapbox(city, mapWrapper, lineCoordinatesMap) {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    mappa = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/davidzhoupolimi/cmieolleq000t01qubidr1mfe",
        center: [0, 0], 
        zoom: 1,
        attributionControl: false,
        projection: 'mercator',
    });

    mappa.addControl(new mapboxgl.AttributionControl(), "bottom-right");
    mappa.addControl(new mapboxgl.NavigationControl(), "top-right");
    mappa.addControl(new mapboxgl.ScaleControl());

    mappa.on("load", () => {
        mappa.resize();
        mappa.once("idle", () => {
            let loader = select("#map-loader");

            if (loader) loader.addClass("opacity-0");
            mappaContainer.removeClass("opacity-0");

            setTimeout(() => {
                if (loader) loader.remove();
                
                disegnaElementiMappa(city.id, city.name);
                aggiungiInterazioniMappa();
                popolaStazioniUI(city.id); 
                
            }, 600);
        });
    });
}

function isolaLineaSullaMappa(lineId) {
    // Se clicco su una linea già isolata, resetto.
    if (appState.isolatedLineId === lineId) {
        resetFiltriMappa();
    } else {
        appState.isolatedLineId = lineId;
        aggiornaFiltriCombinati();
    }
}

function resetFiltriMappa() {
    appState.isolatedLineId = null;
    // Se siamo in playback, fermiamolo per evitare confusione
    if (appState.isPlaying) togglePlayback(false);
    aggiornaFiltriCombinati();
}

function updateSidebarStats() {
    let year = appState.currentYear;
    let cityLines = db.lines.filter((l) => l.city_id == appState.activeCityId);
    
    // Usiamo lo stesso fallback della Mappa
    let endOfTime = appState.maxYear || 2025; 

    for (let line of cityLines) {
        let spanId = `#line-stats-${line.id}`;
        let container = select(spanId);
        if (!container) continue;

        let rels = db.section_lines.filter((sl) => sl.line_id === line.id);
        let sections = rels.map((r) => db.sections.find((s) => s.id === r.section_id)).filter((s) => s);

        let kmOp = 0;
        let kmCons = 0;

        for (let s of sections) {
            let len = s.length || 0;
            if (len > 100) len = len / 1000;
            
            let b = parseYear(s.buildstart);
            let o = parseYear(s.opening);
            
            // 1. FIX DATI SPORCHI (UGUALE A LOGIC_MAP)
            if (b && b < 1800) b = null;
            if (o && o < 1800) o = null;

            // 2. LOGICA "SNAPSHOT" vs "COSTRUZIONE" (UGUALE A LOGIC_MAP)
            if (!o) {
                if (b) { o = 9999; } else { o = endOfTime; }
            }

            if (!b) {
                if (o !== endOfTime) b = o;
                else b = endOfTime;
            }
            
            // 3. CALCOLO STATO
            let closure = parseYear(s.closure) || 9999;
            let isOp = o <= year && closure > year;
            let isCons = b <= year && o > year;

            if (isOp) kmOp += len;
            if (isCons) kmCons += len;
        }

        // --- STAZIONI (Logica semplificata per UI) ---
        let stationRels = db.station_lines.filter((sl) => sl.line_id === line.id);
        let visibleStationCount = 0;
        
        for (let rel of stationRels) {
            let station = db.stations.find((s) => s.id === rel.station_id);
            if (station) {
                let b = parseYear(station.buildstart);
                let o = parseYear(station.opening);
                let c = parseYear(station.closure) || 9999;
                
                if (b && b < 1800) b = null;
                if (o && o < 1800) o = null;

                if (!o) {
                     if (b) o = 9999;
                     else o = endOfTime;
                }
                
                if (o <= year && c > year) {
                    visibleStationCount++;
                }
            }
        }

        let htmlParts = [];
        if (visibleStationCount > 0) {
            let label = visibleStationCount === 1 ? "STAZIONE" : "STAZIONI";
            htmlParts.push(`<span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">${visibleStationCount} ${label}</span>`);
        }
        if (kmCons > 0) {
            htmlParts.push(`<span class="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded border border-orange-200">IN COSTRUZIONE: ${kmCons.toFixed(1)}km</span>`);
        }
        if (kmOp > 0) {
            htmlParts.push(`<span class="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">OPERATIVI: ${kmOp.toFixed(1)}km</span>`);
        }
        if (sections.length === 0 && stationRels.length === 0) {
            htmlParts.push(`<span class="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">DATI MANCANTI</span>`);
        }
        container.html(htmlParts.join(""));
    }
}

// --- FUNZIONE DI ORDINAMENTO (CENTROID + WEST BIAS + BACKTRACKING) ---
/*function ordinaStazioniNaturalmente(stations) {
    if (!stations || stations.length < 2) return stations;

    // 1. Preparazione Dati e Calcolo Baricentro
    let pool = [];
    let sumLat = 0, sumLng = 0;
    
    for (let s of stations) {
        let coords = parseGeometry(s.geometry);
        if (coords) {
            pool.push({ ...s, _coords: coords });
            sumLng += coords[0];
            sumLat += coords[1];
        }
    }

    if (pool.length === 0) return stations;

    let centroid = [sumLng / pool.length, sumLat / pool.length];

    // 2. Trova i Candidati Capolinea (Estremi)
    // Invece di prenderne uno solo, cerchiamo tutti i nodi "molto lontani" dal centro.
    // Diciamo quelli che sono nel top 20% della distanza massima, o semplicemente il più lontano.
    // PER ORA: Prendiamo il più lontano in assoluto per identificare l'asse principale.
    
    let maxDist = -1;
    let furthestNode = pool[0];

    for (let s of pool) {
        let dx = s._coords[0] - centroid[0];
        let dy = s._coords[1] - centroid[1];
        let dSq = dx*dx + dy*dy;
        if (dSq > maxDist) {
            maxDist = dSq;
            furthestNode = s;
        }
    }

    // 3. Scegli il Capolinea di Partenza (Ovest vs Est)
    // Confrontiamo il "furthestNode" con il suo opposto polare (l'estremo dall'altra parte).
    // O più semplicemente: cerchiamo qual è il punto più lontano che sta a OVEST del centro.
    
    let startNode = null;
    let maxDistWest = -1;

    // Cerchiamo il miglior candidato a OVEST (Longitudine < Centroid Longitudine)
    for (let s of pool) {
        // Consideriamo solo chi è a sinistra del baricentro
        if (s._coords[0] < centroid[0]) {
            let dx = s._coords[0] - centroid[0];
            let dy = s._coords[1] - centroid[1];
            let dSq = dx*dx + dy*dy;
            if (dSq > maxDistWest) {
                maxDistWest = dSq;
                startNode = s;
            }
        }
    }

    // Se non abbiamo trovato nessuno a Ovest (linea tutta a Est) o se il calcolo fallisce,
    // usiamo l'estremo assoluto trovato prima (furthestNode), ma preferiamo quello a Ovest se c'è scelta.
    if (!startNode) {
        startNode = furthestNode;
    } 
    // Se l'estremo assoluto (furthestNode) è molto più lontano del nostro candidato Ovest (startNode),
    // potrebbe essere una linea sbilanciata (es. M2 Gessate lunghissima).
    // Ma per la UI vogliamo leggere da sinistra a destra.
    // Quindi 'startNode' (il più lontano a Ovest) è la scelta corretta per l'UI.

    // 4. Costruzione della catena (Nearest Neighbor con Backtracking)
    let sorted = [startNode];
    let unvisited = pool.filter(n => n !== startNode);

    // Soglia per considerare un salto come "cambio ramo"
    const BRANCH_JUMP_THRESHOLD_SQ = 0.02 * 0.02; 

    while (unvisited.length > 0) {
        let tip = sorted[sorted.length - 1]; 
        let nearestIdx = -1;
        let minDistanceSq = Infinity;

        // Cerca il vicino più prossimo alla PUNTA
        for (let i = 0; i < unvisited.length; i++) {
            let current = unvisited[i];
            let dx = tip._coords[0] - current._coords[0];
            let dy = tip._coords[1] - current._coords[1];
            let distSq = dx * dx + dy * dy;

            if (distSq < minDistanceSq) {
                minDistanceSq = distSq;
                nearestIdx = i;
            }
        }

        // Se il vicino è "abbastanza vicino", proseguiamo la linea
        if (nearestIdx !== -1 && minDistanceSq < BRANCH_JUMP_THRESHOLD_SQ) {
            sorted.push(unvisited[nearestIdx]);
            unvisited.splice(nearestIdx, 1);
        } 
        else {
            // BACKTRACKING: Siamo in un vicolo cieco.
            // Cerchiamo l'innesto migliore tra i nodi GIÀ visitati.
            let bestCandidateIdx = -1;
            let globalMinDist = Infinity;
            // Cerchiamo anche dove innestarlo per mantenere ordine visivo (opzionale)

            for (let u = 0; u < unvisited.length; u++) {
                let candidate = unvisited[u];
                for (let v of sorted) {
                    let dx = v._coords[0] - candidate._coords[0];
                    let dy = v._coords[1] - candidate._coords[1];
                    let d = dx*dx + dy*dy;
                    if (d < globalMinDist) {
                        globalMinDist = d;
                        bestCandidateIdx = u;
                    }
                }
            }

            if (bestCandidateIdx !== -1) {
                // Trovato un nuovo ramo!
                // Per migliorare la UX, se questo è un ramo parallelo (tipo Bisceglie),
                // dovrebbe apparire DOPO il bivio (Pagano).
                // L'algoritmo "append" attuale lo mette in fondo alla lista, che è OK:
                // [Rho...Pagano...Sesto] [Bisceglie...Wagner]
                sorted.push(unvisited[bestCandidateIdx]);
                unvisited.splice(bestCandidateIdx, 1);
            } else {
                // Caso estremo
                sorted.push(unvisited[0]);
                unvisited.splice(0, 1);
            }
        }
    }

    return sorted;
}*/

// --- FUNZIONE DI ORDINAMENTO "MINIMUM SPANNING TREE" (MST) ---
// Ricostruisce la struttura della linea minimizzando le distanze totali.
// Questo evita salti tra rami paralleli e gestisce perfettamente le diramazioni.
/*function ordinaStazioniNaturalmente(stations) {
    if (!stations || stations.length < 2) return stations;

    // 1. Preparazione Nodi
    let nodes = stations.map(s => {
        let coords = parseGeometry(s.geometry);
        if (!coords) return null;
        return {
            original: s,
            id: s.id,
            coords: coords,
            adj: [], // Lista di adiacenza (i collegamenti dello scheletro)
            visited: false
        };
    }).filter(s => s !== null);

    if (nodes.length === 0) return stations;

    // 2. Calcolo di tutte le distanze possibili (Archi)
    let edges = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            let dx = nodes[i].coords[0] - nodes[j].coords[0];
            let dy = nodes[i].coords[1] - nodes[j].coords[1];
            let distSq = dx*dx + dy*dy;
            
            // Ottimizzazione: ignoriamo collegamenti palesemente troppo lunghi (> 5km)
            // per evitare di collegare stazioni ai lati opposti della città
            if (distSq < 0.05 * 0.05) {
                edges.push({ u: i, v: j, w: distSq });
            }
        }
    }

    // Ordiniamo gli archi dal più corto al più lungo
    edges.sort((a, b) => a.w - b.w);

    // 3. Algoritmo di Kruskal (Costruzione MST)
    // Colleghiamo i nodi usando gli archi più corti, evitando cicli
    let parent = new Array(nodes.length).fill(0).map((_, i) => i);
    
    function find(i) {
        if (parent[i] === i) return i;
        return parent[i] = find(parent[i]);
    }
    
    function union(i, j) {
        let rootI = find(i);
        let rootJ = find(j);
        if (rootI !== rootJ) {
            parent[rootI] = rootJ;
            return true; // Collegamento effettuato
        }
        return false; // Erano già collegati (ciclo evitato)
    }

    let edgesCount = 0;
    for (let e of edges) {
        // Se u e v non sono già connessi, colleghiamoli!
        if (union(e.u, e.v)) {
            // Aggiungiamo il collegamento al grafo bidirezionale
            nodes[e.u].adj.push(nodes[e.v]);
            nodes[e.v].adj.push(nodes[e.u]);
            edgesCount++;
        }
        // Interrompiamo quando abbiamo collegato tutto (N-1 archi)
        // Nota: non interrompiamo forzatamente per gestire eventuali isole disconnesse
    }

    // 4. Identifica il Capolinea di Partenza (Ovest)
    // Cerchiamo le "foglie" dell'albero (nodi con 1 solo collegamento)
    let leaves = nodes.filter(n => n.adj.length === 1);
    
    // Fallback: se è un cerchio o strano, prendi tutti
    if (leaves.length === 0) leaves = nodes;

    // Scegli la foglia più a Ovest (Min Longitude)
    leaves.sort((a, b) => a.coords[0] - b.coords[0]);
    let startNode = leaves[0];

    // 5. Traversamento DFS (Depth First Search)
    // Questo garantisce che un ramo venga esplorato tutto prima di tornare al bivio
    let finalOrder = [];
    
    // Stack per la DFS: [nodo_corrente]
    // Per gestire l'ordine dei rami ai bivi, dobbiamo ordinare i vicini
    let stack = [startNode];
    startNode.visited = true;

    while (stack.length > 0) {
        let curr = stack.pop(); // Prendi l'ultimo (LIFO -> DFS)
        finalOrder.push(curr.original);

        // Raccogli i vicini non visitati
        let neighbors = curr.adj.filter(n => !n.visited);

        // Ordina i vicini: vogliamo inserire nello stack PRIMA quelli a EST,
        // così verranno prelevati (pop) DOPO quelli a OVEST/Vicini.
        // In realtà per DFS, l'ultimo inserito è il primo processato.
        // Se c'è un bivio (es. Pagano -> va a Conciliazione e Wagner),
        // vogliamo processare Wagner (Ramo Ovest) prima di Conciliazione (Est).
        // Quindi inseriamo Conciliazione PRIMA di Wagner nello stack.
        
        // Ordina: Est (Maggiore Longitudine) -> Ovest (Minore Longitudine)
        neighbors.sort((a, b) => b.coords[0] - a.coords[0]); 

        for (let n of neighbors) {
            n.visited = true;
            stack.push(n);
        }
    }

    // 6. Recupero Isole (se i dati erano troppo distanti per essere collegati)
    let unvisited = nodes.filter(n => !n.visited);
    if (unvisited.length > 0) {
        unvisited.sort((a, b) => a.coords[0] - b.coords[0]);
        for (let n of unvisited) finalOrder.push(n.original);
    }

    return finalOrder;
}*/

// --- FUNZIONE DI ORDINAMENTO "MST GUIDATO DAL TRAGUARDO" ---
// 1. Costruisce lo scheletro della linea (MST) per garantire connessioni reali.
// 2. Identifica un "Traguardo" a Est (es. Gessate).
// 3. Ai bivi, dà priorità ai rami che si allontanano dal traguardo (es. Abbiategrasso),
//    completandoli prima di proseguire sul tronco principale.
/*function ordinaStazioniNaturalmente(stations) {
    if (!stations || stations.length < 2) return stations;

    // 1. Preparazione Nodi
    let nodes = stations.map(s => {
        let coords = parseGeometry(s.geometry);
        if (!coords) return null;
        return {
            original: s,
            id: s.id,
            coords: coords,
            adj: [], 
            visited: false
        };
    }).filter(s => s !== null);

    if (nodes.length === 0) return stations;

    // 2. Costruzione MST (Kruskal)
    let edges = [];
    // Soglia ampia (0.05) per essere sicuri di connettere tutto, l'MST scremerà i migliori
    const MAX_DIST_SQ = 0.05 * 0.05; 

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            let dx = nodes[i].coords[0] - nodes[j].coords[0];
            let dy = nodes[i].coords[1] - nodes[j].coords[1];
            let distSq = dx*dx + dy*dy;
            
            if (distSq < MAX_DIST_SQ) {
                edges.push({ u: i, v: j, w: distSq });
            }
        }
    }

    edges.sort((a, b) => a.w - b.w);

    let parent = new Array(nodes.length).fill(0).map((_, i) => i);
    function find(i) { return parent[i] === i ? i : parent[i] = find(parent[i]); }
    function union(i, j) {
        let rootI = find(i);
        let rootJ = find(j);
        if (rootI !== rootJ) { parent[rootI] = rootJ; return true; }
        return false;
    }

    for (let e of edges) {
        if (union(e.u, e.v)) {
            nodes[e.u].adj.push(nodes[e.v]);
            nodes[e.v].adj.push(nodes[e.u]);
        }
    }

    // 3. Identifica Start (Ovest) e Target (Est)
    // Target: il punto più a Est in assoluto (ci serve come bussola)
    let targetNode = nodes[0];
    for(let n of nodes) {
        if (n.coords[0] > targetNode.coords[0]) targetNode = n;
    }

    // Start: una "foglia" (capolinea) che sia il più a Ovest possibile
    let leaves = nodes.filter(n => n.adj.length === 1);
    if (leaves.length === 0) leaves = nodes;
    
    leaves.sort((a, b) => a.coords[0] - b.coords[0]);
    let startNode = leaves[0];

    // 4. Traversamento DFS (Priorità Rami)
    let finalOrder = [];
    let stack = [startNode];
    startNode.visited = true;

    while (stack.length > 0) {
        let curr = stack.pop();
        finalOrder.push(curr.original);

        // Prendi i vicini non visitati
        let neighbors = curr.adj.filter(n => !n.visited);

        // *** IL TRUCCO: Ordinamento nello Stack ***
        // Lo stack è LIFO (Last In, First Out).
        // Vogliamo processare PRIMA il ramo secondario (Lontano dal Target)
        // e DOPO il ramo principale (Vicino al Target).
        // Quindi dobbiamo inserire:
        // 1. Prima il MAIN (Vicino) -> Finisce in fondo allo stack
        // 2. Poi il RAMO (Lontano) -> Finisce in cima -> Viene estratto subito
        
        neighbors.sort((a, b) => {
            let distA = (a.coords[0]-targetNode.coords[0])**2 + (a.coords[1]-targetNode.coords[1])**2;
            let distB = (b.coords[0]-targetNode.coords[0])**2 + (b.coords[1]-targetNode.coords[1])**2;
            
            // Ordine Crescente: [Vicino, Lontano]
            // Push Vicino (Main), Push Lontano (Branch)
            // Pop -> Lontano (Branch viene fatto per primo!)
            return distA - distB;
        });

        for (let n of neighbors) {
            n.visited = true;
            stack.push(n);
        }
    }

    // 5. Recupero Isole
    let unvisited = nodes.filter(n => !n.visited);
    if (unvisited.length > 0) {
        unvisited.sort((a, b) => a.coords[0] - b.coords[0]);
        for (let n of unvisited) finalOrder.push(n.original);
    }

    return finalOrder;
}*/

// --- FUNZIONE MST + SUBTREE SIZE (Vicoli Ciechi Prima) ---
function ordinaStazioniNaturalmente(stations) {
    if (!stations || stations.length < 2) return stations;

    // 1. Preparazione Nodi e MST (Invariato, funziona bene)
    let nodes = stations.map((s, i) => {
        let coords = parseGeometry(s.geometry);
        return coords ? { original: s, coords: coords, adj: [], visited: false } : null;
    }).filter(s => s !== null);

    if (nodes.length === 0) return stations;

    // Costruzione MST semplice (Distanza Euclidea)
    let edges = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            let dx = nodes[i].coords[0] - nodes[j].coords[0];
            let dy = nodes[i].coords[1] - nodes[j].coords[1];
            let distSq = dx*dx + dy*dy;
            if (distSq < 0.05 * 0.05) edges.push({ u: i, v: j, w: distSq });
        }
    }
    edges.sort((a, b) => a.w - b.w);

    let parent = new Array(nodes.length).fill(0).map((_, i) => i);
    function find(i) { return parent[i] === i ? i : parent[i] = find(parent[i]); }
    function union(i, j) {
        let rootI = find(i);
        let rootJ = find(j);
        if (rootI !== rootJ) { parent[rootI] = rootJ; return true; } return false;
    }

    for (let e of edges) {
        if (union(e.u, e.v)) {
            nodes[e.u].adj.push(nodes[e.v]);
            nodes[e.v].adj.push(nodes[e.u]);
        }
    }

    // 2. Identifica Start (Ovest)
    let leaves = nodes.filter(n => n.adj.length === 1);
    if (leaves.length === 0) leaves = nodes;
    leaves.sort((a, b) => a.coords[0] - b.coords[0]);
    let startNode = leaves[0];

    // 3. DFS Principale
    let finalOrder = [];
    let stack = [startNode];
    startNode.visited = true;

    // Funzione per contare i nodi nel ramo (Senza visitare davvero)
    function getBranchSize(node, fromNode) {
        let size = 1;
        let q = [node];
        let seen = new Set([fromNode, node]); // Blocchiamo il ritorno
        
        while(q.length > 0) {
            let curr = q.shift();
            for (let n of curr.adj) {
                // Conta solo nodi non visitati globalmente (ancora da fare)
                // E non tornare indietro verso 'fromNode'
                if (!n.visited && !seen.has(n)) {
                    seen.add(n);
                    size++;
                    q.push(n);
                }
            }
        }
        return size;
    }

    while (stack.length > 0) {
        let curr = stack.pop();
        finalOrder.push(curr.original);

        let neighbors = curr.adj.filter(n => !n.visited);

        if (neighbors.length > 0) {
            // Calcola dimensioni rami
            let weightedNeighbors = neighbors.map(n => {
                return { node: n, size: getBranchSize(n, curr) };
            });

            // ORDINAMENTO STACK:
            // Vogliamo estrarre PRIMA i rami PICCOLI (Size basso).
            // Stack LIFO: Ultimo Inserito = Primo Estratto.
            // Quindi inseriamo: [Grande, Medio, Piccolo].
            // Estrazione: Piccolo -> Medio -> Grande.
            
            // Ordiniamo per Size DECRESCENTE (Grande -> Piccolo)
            // Array: [Romolo(20), Abbiategrasso(1)]
            // Push Romolo (Fondo). Push Abbiategrasso (Cima).
            // Pop -> Abbiategrasso.
            
            weightedNeighbors.sort((a, b) => b.size - a.size);

            for (let wn of weightedNeighbors) {
                wn.node.visited = true;
                stack.push(wn.node);
            }
        }
    }

    // Recupero isole
    let unvisited = nodes.filter(n => !n.visited);
    if (unvisited.length > 0) {
        unvisited.sort((a, b) => a.coords[0] - b.coords[0]);
        for (let n of unvisited) finalOrder.push(n.original);
    }

    return finalOrder;
}