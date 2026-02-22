// script.js
// Create starry background
function createStars() {
    const container = document.getElementById('stars-container');
    const starCount = 200;
    
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        
        // Random properties for each star
        const size = Math.random() * 2.5;
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const duration = 2 + Math.random() * 8 + 's';
        const hue = 200 + Math.random() * 40;
        
        star.style.width = size + 'px';
        star.style.height = size + 'px';
        star.style.left = left + '%';
        star.style.top = top + '%';
        star.style.setProperty('--duration', duration);
        star.style.backgroundColor = `hsl(${hue}, 100%, ${70 + Math.random() * 30}%)`;
        
        container.appendChild(star);
    }
}

// CORS proxy function
function getProxyUrl(url) {
    return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
}

// Main application logic
document.addEventListener('DOMContentLoaded', function() {
    createStars();
    
    // Get DOM elements
    const selector = document.getElementById('selector');
    const plateSolveBtn = document.getElementById('platesolve-btn');
    const status = document.getElementById('status');
    const resultsDiv = document.getElementById('results');
    const resultsContent = document.getElementById('results-content');
    const apiKeyInput = document.getElementById('api-key');
    const closeResultsBtn = document.getElementById('close-results');
    const controlsToggle = document.getElementById('controls-toggle');
    const controls = document.getElementById('controls');
    const closeHeaderBtn = document.getElementById('close-header');
    const header = document.getElementById('header');
    const apiStatus = document.getElementById('api-status');
    const toggleApiKeyBtn = document.getElementById('toggle-api-key');
    
    let viewer, plateSolvingEnabled = false, currentImageSource;
    let apiKeyVisible = false;
    let astrometrySession = null;
    let sessionExpiry = null;
    let lastClickTime = 0;
    
    // Collapsible controls functionality
    const isCollapsed = localStorage.getItem('controlsCollapsed') === 'true';
    if (isCollapsed) {
        controls.classList.add('collapsed');
        controlsToggle.textContent = '▼';
    } else {
        controlsToggle.textContent = '▲';
    }
    
    controlsToggle.addEventListener('click', function() {
        controls.classList.toggle('collapsed');
        
        if (controls.classList.contains('collapsed')) {
            controlsToggle.textContent = '▼';
            localStorage.setItem('controlsCollapsed', 'true');
        } else {
            controlsToggle.textContent = '▲';
            localStorage.setItem('controlsCollapsed', 'false');
        }
    });
    
    // Close header functionality
    closeHeaderBtn.addEventListener('click', function() {
        header.style.opacity = '0';
        header.style.transform = 'translateX(-50%) translateY(20px)';
        
        setTimeout(() => {
            header.style.display = 'none';
        }, 300);
    });
    
    // Close results functionality
    closeResultsBtn.addEventListener('click', function() {
        resultsDiv.style.display = 'none';
    });
    
    // Save API key on blur
    apiKeyInput.addEventListener('blur', function() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('astrometryApiKey', apiKey);
            apiStatus.classList.add('show');
            setTimeout(() => {
                apiStatus.classList.remove('show');
            }, 2000);
        }
    });
    
    // Toggle API key visibility
    toggleApiKeyBtn.addEventListener('click', function() {
        apiKeyVisible = !apiKeyVisible;
        if (apiKeyVisible) {
            toggleApiKeyBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            apiKeyInput.type = 'text';
        } else {
            toggleApiKeyBtn.innerHTML = '<i class="fas fa-eye"></i>';
            apiKeyInput.type = 'password';
        }
    });
    
    // Load images and initialize viewer
    status.textContent = 'Loading image catalog...';
    
    // Load images from JSON file using CORS proxy
    const imagesJsonUrl = 'images.json';
    fetch(imagesJsonUrl)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load images.json');
            return response.json();
        })
        .then(data => {
            console.log(data);
            const images = data;
            selector.innerHTML = '';
            
            if (!images.length) {
                selector.innerHTML = '<option>No images found</option>';
                return;
            }
            
            images.forEach(image => {
                const option = document.createElement('option');
                option.value = image;
                option.text = image.split('/').pop().replace('.dzi', '').replace(/_/g, ' ');
                selector.appendChild(option);
            });
            
            currentImageSource = images[0];
            
            // Initialize OpenSeadragon viewer
            viewer = OpenSeadragon({
                id: "viewer",
                prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/",
                tileSources: currentImageSource,
                crossOriginPolicy: 'Anonymous',
                showNavigator: true,
                animationTime: 0.5,
                blendTime: 0.1,
                constrainDuringPan: true,
                maxZoomPixelRatio: 2,
                minZoomLevel: 1,
                visibilityRatio: 1,
                zoomPerClick: 2,
            });
            
            setupPlateSolving();
            plateSolveBtn.disabled = false;
            status.textContent = 'Ready, waiting for an image.';
        })
        .catch(error => {
            selector.innerHTML = '<option>Error loading images</option>';
            console.error(error);
            status.textContent = 'Error loading image catalog. Check console for details.';
        });
    
    // Handle image selection change
    selector.addEventListener('change', () => {
        if (viewer) {
            currentImageSource = selector.value;
            viewer.open(selector.value);
            status.textContent = `Loading ${selector.options[selector.selectedIndex].text}...`;
        }
    });
    
    // Plate solving setup
    function setupPlateSolving() {
        viewer.addHandler('canvas-click', async function(event) {
            if (!plateSolvingEnabled) return;
            
            // Check rate limiting (10 seconds between clicks)
            const now = Date.now();
            if (now - lastClickTime < 10000) {
                const remainingTime = Math.ceil((10000 - (now - lastClickTime)) / 1000);
                status.textContent = `Please wait ${remainingTime} seconds before clicking again`;
                return;
            }
            lastClickTime = now;
            
            event.preventDefaultAction = true;
            status.innerHTML = '<span class="spinner"></span> Extracting tile from image...';
            
            try {
                const img = await viewer.drawer.canvas.toDataURL('image/jpeg');
                const imageBlob = await fetch(img).then(res => res.blob());
                status.innerHTML = '<span class="spinner"></span> Sending to Astrometry.net...';
                
                try {
                    const result = await sendToAstrometry(imageBlob);
                    status.textContent = 'Plate solving complete! Results displayed.';
                    
                    // Format results for display
                    resultsContent.innerHTML = `
                        <div class="result-item">
                            <span class="result-label">Status:</span>
                            <span class="result-value">${result.status}</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Results URL:</span>
                            <a href="${result.url}" target="_blank" class="result-link">${result.url}</a>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Job ID:</span>
                            <span class="result-value">${result.jobId}</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Submission ID:</span>
                            <span class="result-value">${result.subId}</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Processing Time:</span>
                            <span class="result-value">${result.processingTime} seconds</span>
                        </div>
                    `;
                    resultsDiv.style.display = 'block';
                } catch (err) {
                    status.textContent = `Error: ${err.message}`;
                }
            } catch (err) {
                status.textContent = `Error: ${err.message}`;
            }
        });
    }
    
    // Toggle plate solving
    plateSolveBtn.addEventListener('click', () => {
        plateSolvingEnabled = !plateSolvingEnabled;
        plateSolveBtn.innerHTML = plateSolvingEnabled
            ? '<i class="fas fa-ban"></i> Disable Plate Solving'
            : '<i class="fas fa-crosshairs"></i> Enable Plate Solving';
        status.textContent = plateSolvingEnabled
            ? 'Click on the image to extract a tile and solve its coordinates'
            : 'Plate solving disabled';
    });
    

    // Load saved API key and session if they exist
    const savedApiKey = localStorage.getItem('astrometryApiKey');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        apiKeyInput.type = 'password';
    }

    astrometrySession = localStorage.getItem('astrometrySession');
    sessionExpiry = localStorage.getItem('astrometrySessionExpiry');
    if (sessionExpiry) {
        sessionExpiry = parseInt(sessionExpiry, 10);
    }

    async function getAstrometrySession() {
        const API_KEY = apiKeyInput.value.trim();
        if (!API_KEY) throw new Error('API key is required.');
        
        // Check if we have a valid cached session (sessions last about 24 hours)
        if (astrometrySession && sessionExpiry && Date.now() < sessionExpiry) {
            return astrometrySession;
        }
        
        status.innerHTML = '<span class="spinner"></span> Processing image in Astrometry.net...';
        
        const loginUrl = getProxyUrl('https://nova.astrometry.net/api/login');
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `request-json=${encodeURIComponent(JSON.stringify({ apikey: API_KEY }))}`
        });
        const loginData = await loginRes.json();
        console.log(loginData);
        const login = loginData;
        
        if (login.status !== 'success') {
            throw new Error('Astrometry login failed: ' + (login.errormessage || 'Unknown error'));
        }
        
        astrometrySession = login.session;
        sessionExpiry = Date.now() + (23 * 60 * 60 * 1000);
        
        localStorage.setItem('astrometrySession', astrometrySession);
        localStorage.setItem('astrometrySessionExpiry', sessionExpiry.toString());
        
        return astrometrySession;
    }


    async function sendToAstrometry(imageBlob) {
        const startTime = Date.now();
        
        try {
            const session = await getAstrometrySession();

            // Use proxy for upload
            const uploadUrl = getProxyUrl('https://nova.astrometry.net/api/upload');
            const formData = new FormData();
            formData.append('request-json', JSON.stringify({
                session: session,
                publicly_visible: 'y',
                allow_modifications: 'y',
                allow_commercial_use: 'd'
            }));
            formData.append('session', session);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `vera_rubin_viewer_${timestamp}.jpg`;
            formData.append('file', imageBlob, filename);

            const uploadRes = await fetch(uploadUrl, {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadRes.json();
            const upload = uploadData;
            
            if (upload.status !== 'success') {
                // If session expired, clear cached session and retry once
                if (upload.errormessage && upload.errormessage.includes('session')) {
                    astrometrySession = null;
                    sessionExpiry = null;
                    const newSession = await getAstrometrySession();
                    
                    // Retry upload with new session
                    formData.set('request-json', JSON.stringify({
                        session: newSession,
                        publicly_visible: 'y',
                        allow_modifications: 'y',
                        allow_commercial_use: 'd'
                    }));
                    formData.set('session', newSession);
                    
                    const retryRes = await fetch(uploadUrl, {
                        method: 'POST',
                        body: formData
                    });
                    const retryData = await retryRes.json();
                    const retryUpload = retryData;
                    
                    if (retryUpload.status !== 'success') {
                        throw new Error('Upload failed after retry: ' + (retryUpload.errormessage || 'Unknown error'));
                    }
                    return await pollForJobCompletion(retryUpload.subid, startTime);
                }
                throw new Error('Upload failed: ' + (upload.errormessage || 'Unknown error'));
            }
            
            return await pollForJobCompletion(upload.subid, startTime);
        } catch (error) {
            // If it's a session error, clear the cached session
            if (error.message.includes('session') || error.message.includes('login')) {
                astrometrySession = null;
                sessionExpiry = null;
            }
            throw error;
        }
    }

    async function pollForJobCompletion(subId, startTime) {
        let jobId = null;
        let image_id = null;
        let attempts = 0;
        const maxAttempts = 10;
        const delay = 15000; // 15 seconds
        
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, delay));
            attempts++;
            
            const res = await fetch(getProxyUrl(`https://nova.astrometry.net/api/submissions/${subId}`));
            const subData = await res.json();
            
            if (subData.jobs && subData.jobs.length) {
                jobId = subData.jobs[0];
                image_id = subData.user_images[0];
                break;
            }
            
            status.innerHTML = `<span class="spinner"></span> Processing (${attempts}/${maxAttempts})...`;
        }
        
        if (!jobId) throw new Error('Plate solving timed out - no job created but check on your Astrometry submissions');
        
        let jobStatus = 'solving';
        attempts = 0;
        
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, delay));
            attempts++;
            
            const jobRes = await fetch(getProxyUrl(`https://nova.astrometry.net/api/jobs/${jobId}`));
            const jobData = await jobRes.json();
            const job = jobData;
            
            if (job.status === 'success') {
                const processingTime = Math.round((Date.now() - startTime) / 1000);
                return {
                    status: "success",
                    url: `https://nova.astrometry.net/user_images/${image_id}`,
                    jobId: jobId,
                    subId: subId,
                    processingTime: processingTime
                };
            }
            
            if (job.status === 'failure') {
                throw new Error('Plate solving failed: ' + (job.error_message || 'Unknown error'));
            }
            
            status.innerHTML = `<span class="spinner"></span> Solving (${attempts}/${maxAttempts})...`;
        }
        
        throw new Error('Plate solving timed out - job not completed');
    }
});
