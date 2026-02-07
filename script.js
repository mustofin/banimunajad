// ============================================
// CONFIGURATION - GANTI DENGAN URL DEPLOYMENT ANDA
// ============================================
const CONFIG = {
    // Ganti dengan URL deployment Google Apps Script Anda. 
    // Jika kosong, akan menggunakan data dummy/contoh.
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxXpJ0mqogynJJt79kXKDfA6XJO6vLUvSDGhJCQYoylOoOhypfyxtZgS_hYEFwXTEGE/exec',

    // Default settings
    REFRESH_INTERVAL: 30000, // Auto refresh setiap 30 detik (opsional)
};

// ============================================
// GLOBAL STATE
// ============================================
let treeData = null;
let svg = null;
let g = null;
let zoom = null;
let root = null;
let showSpouseMode = false;
let currentTransform = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Generate placeholder image berdasarkan gender dan usia
function getPlaceholderImage(gender, birthYear, name) {
    const encodedName = name ? encodeURIComponent(name) : 'User';
    const bg = gender === 'Laki-Laki' ? '0D8ABC' : 'E91E63';
    return `https://ui-avatars.com/api/?name=${encodedName}&background=${bg}&color=fff&size=200`;
}

// Format nama dengan gelar
function formatName(data) {
    if (isDeceased(data)) {
        const prefix = data.gender === 'Laki-Laki' ? 'Alm. ' : 'Almh. ';
        // Cek apakah nama sudah mengandung gelar (case insensitive)
        const lowerName = data.nama.toLowerCase();
        // Remove trailing space from prefix for check 'alm.'
        const cleanPrefix = prefix.trim().toLowerCase();

        if (lowerName.includes('alm.') || lowerName.includes('almh.')) {
            return data.nama;
        }
        return prefix + data.nama;
    }
    return data.nama;
}

// Cek apakah sudah wafat
function isDeceased(data) {
    return data.tahun_wafat && data.tahun_wafat.trim() !== '' && data.tahun_wafat !== '-';
}

// Get color based on status
function getNodeColor(data) {
    if (isDeceased(data)) {
        return '#9ca3af'; // Gray for deceased
    }
    return '#22c55e'; // Green for living (matching legend)
}

// Parse data dari Google Sheets ke format tree
function parseDataToHierarchy(flatData) {
    const idMap = new Map();
    const nameMap = new Map();
    const rootNodes = [];

    // First pass: create all nodes and map by ID and Name
    flatData.forEach(row => {
        // Sanitize photo URLs (handle '-' or empty strings)
        if (!row.foto || row.foto === '-' || row.foto.trim() === '') row.foto = null;
        if (!row.foto_pasangan || row.foto_pasangan === '-' || row.foto_pasangan.trim() === '') row.foto_pasangan = null;

        const node = {
            id: String(row.id),
            data: row,
            children: [],
            spouse: null
        };
        idMap.set(String(row.id), node);

        if (row.nama && row.nama.trim()) {
            nameMap.set(row.nama.trim().toLowerCase(), node);
        }
    });

    // Second pass: build relationships
    flatData.forEach(row => {
        const node = idMap.get(String(row.id));

        // Coba dapatkan identifier orang tua
        // Prioritas: parent_id (dari API baru) > orang_tua (bisa ID atau Nama) > bin (regex ID)
        let parentIdentifier = row.parent_id || row.orang_tua || row.orangtua;

        // Fallback ke regex bin jika masih null
        if (!parentIdentifier && row.bin && row.bin.match(/^\d+$/)) {
            parentIdentifier = row.bin.match(/^\d+$/)[0];
        }

        // Bersihkan data identifier
        if (parentIdentifier && (String(parentIdentifier) === '-' || String(parentIdentifier).trim() === '')) {
            parentIdentifier = null;
        }

        let parent = null;

        if (parentIdentifier) {
            const cleanIdentifier = String(parentIdentifier).trim();

            // 1. Coba cari berdasarkan ID
            if (idMap.has(cleanIdentifier)) {
                parent = idMap.get(cleanIdentifier);
            }
            // 2. Coba cari berdasarkan Nama (case insensitive)
            else if (nameMap.has(cleanIdentifier.toLowerCase())) {
                parent = nameMap.get(cleanIdentifier.toLowerCase());
            }
        }

        if (parent) {
            parent.children.push(node);
        } else {
            // Jika tidak punya parent, dianggap root
            // TAPI cek dulu apakah dia sebenarnya punya orang tua tapi datanya strings "Alm. X"? 
            // (Sudah tercover di logic step 2 atas)
            rootNodes.push(node);
        }

        // Handle spouse
        if (row.pasangan && row.pasangan.trim() !== '' && row.pasangan !== '-') {
            node.spouse = {
                name: row.pasangan,
                photo: row.foto_pasangan
            };
        }
    });

    // Return the primary root node
    if (rootNodes.length === 0) return null;

    // Prioritaskan root dengan ID '1' jika ada
    const mainRoot = rootNodes.find(n => n.id === '1') || rootNodes[0];

    // Jika ada multiple roots yang tidak tersambung (orphan), 
    // idealnya kita buat dummy root. Tapi untuk sekarang kita return mainRoot saja.
    return mainRoot;
}

// ============================================
// DATA FETCHING
// ============================================

async function fetchFamilyData() {
    try {
        showLoading(true);

        if (!CONFIG.SCRIPT_URL) {
            console.log("No Script URL configured, using sample data.");
            useSampleData();
            showToast('Menggunakan data contoh (Mode Demo)');
            return;
        }

        const response = await fetch(CONFIG.SCRIPT_URL);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();

        if (data.success) {
            treeData = parseDataToHierarchy(data.data);
            renderTree();
            showToast('Data berhasil dimuat');
        } else {
            throw new Error(data.error || 'Failed to load data');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        showToast('Gagal memuat data. Menggunakan data contoh...', 'error');

        // Fallback: gunakan data contoh
        useSampleData();
    } finally {
        showLoading(false);
    }
}

function useSampleData() {
    // Data contoh berdasarkan struktur yang diberikan
    const sampleData = [
        {
            id: '1',
            nama: 'Kyai Munajad',
            bin: '-',
            orang_tua: '-',
            gender: 'Laki-Laki',
            alamat: 'Malang',
            no_hp: '',
            tahun_lahir: '1900',
            tempat_lahir: 'Malang',
            tahun_wafat: '1978',
            tempat_wafat: 'Malang',
            foto: '',
            pasangan: 'Nyai Munajad',
            foto_pasangan: '',
            bio: 'Leluhur utama keluarga besar Bani Munajad.'
        },
        {
            id: '2',
            nama: 'Siti Muhajat',
            bin: 'Alm. Kyai Munajad',
            orang_tua: '1',
            gender: 'Perempuan',
            alamat: '',
            no_hp: '',
            tahun_lahir: '1925',
            tempat_lahir: 'Malang',
            tahun_wafat: '1995',
            tempat_wafat: 'Malang',
            foto: '',
            pasangan: '',
            foto_pasangan: '',
            bio: 'Putri tertua dari Kyai Munajad.'
        },
        {
            id: '3',
            nama: 'Suharah',
            bin: 'Alm. Kyai Munajad',
            orang_tua: '1',
            gender: 'Laki-Laki',
            alamat: 'Kasikon',
            no_hp: '',
            tahun_lahir: '1928',
            tempat_lahir: 'Malang',
            tahun_wafat: '1998',
            tempat_wafat: 'Malang',
            foto: '',
            pasangan: '',
            foto_pasangan: '',
            bio: 'Anak kedua, tinggal di area Kasikon.'
        }
    ];

    treeData = parseDataToHierarchy(sampleData);
    renderTree();
}

// ============================================
// TREE RENDERING
// ============================================

function renderTree() {
    if (!treeData) return;

    // Clear previous
    d3.select('#tree-container').selectAll('*').remove();

    // Setup dimensions
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create SVG
    svg = d3.select('#tree-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height]);

    // Add zoom behavior
    zoom = d3.zoom()
        .scaleExtent([0.1, 3])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
            currentTransform = event.transform;
        });

    svg.call(zoom);

    // Create main group
    g = svg.append('g');

    // Create tree layout
    const treeLayout = d3.tree()
        .nodeSize([showSpouseMode ? 280 : 180, 120])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.5));

    // Create hierarchy
    root = d3.hierarchy(treeData, d => d.children);

    // Calculate tree
    treeLayout(root);

    // Center the tree
    const bounds = getTreeBounds(root);
    const scale = Math.min(
        width / (bounds.width + 100),
        height / (bounds.height + 100),
        1
    );
    const initialTransform = d3.zoomIdentity
        .translate(width / 2 - bounds.cx * scale, 80)
        .scale(scale);

    svg.call(zoom.transform, initialTransform);

    // Draw links
    drawLinks();

    // Draw nodes
    drawNodes();

    // Draw spouse connections if enabled
    if (showSpouseMode) {
        drawSpouseConnections();
    }
}

function getTreeBounds(root) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    root.descendants().forEach(d => {
        minX = Math.min(minX, d.x);
        maxX = Math.max(maxX, d.x);
        minY = Math.min(minY, d.y);
        maxY = Math.max(maxY, d.y);
    });

    return {
        width: maxX - minX,
        height: maxY - minY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2
    };
}

function drawLinks() {
    const links = root.links();

    g.selectAll('.link')
        .data(links)
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('d', d3.linkVertical()
            .x(d => d.x)
            .y(d => d.y)
        );
}

function drawNodes() {
    const nodes = root.descendants();

    const node = g.selectAll('.node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', d => `node ${isDeceased(d.data.data) ? 'deceased' : ''}`)
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .on('click', (event, d) => showDetail(d.data.data))
        .style('cursor', 'pointer');

    // Main circle
    node.append('circle')
        .attr('r', 35)
        .attr('fill', d => getNodeColor(d.data.data));

    // Photo clip path
    const defs = svg.append('defs');

    nodes.forEach((d, i) => {
        const clipId = `clip-${i}`;
        defs.append('clipPath')
            .attr('id', clipId)
            .append('circle')
            .attr('r', 32);
    });

    // Photo
    node.append('image')
        .attr('x', -32)
        .attr('y', -32)
        .attr('width', 64)
        .attr('height', 64)
        .attr('clip-path', (d, i) => `url(#clip-${i})`)
        .attr('href', d => {
            const data = d.data.data;
            if (data.foto && data.foto.trim() !== '') {
                return data.foto;
            }
            return getPlaceholderImage(data.gender, data.tahun_lahir, data.nama);
        })
        .on('error', function () {
            // Fallback jika gambar gagal load
            const data = d3.select(this.parentNode).datum().data.data;
            d3.select(this).attr('href', getPlaceholderImage(data.gender, data.tahun_lahir, data.nama));
        });

    // Name label
    node.append('text')
        .attr('class', 'name-label')
        .attr('dy', 55)
        .attr('text-anchor', 'middle')
        .text(d => {
            const name = formatName(d.data.data);
            return name.length > 20 ? name.substring(0, 20) + '...' : name;
        });

    // Year label
    node.append('text')
        .attr('class', 'year-label')
        .attr('dy', 70)
        .attr('text-anchor', 'middle')
        .text(d => {
            const birth = d.data.data.tahun_lahir || '?';
            const death = d.data.data.tahun_wafat;
            return death ? `${birth} - ${death}` : `b. ${birth}`;
        });

    // Spouse node (if enabled)
    if (showSpouseMode) {
        const nodesWithSpouse = nodes.filter(d => d.data.spouse);

        nodesWithSpouse.forEach(d => {
            const spouseG = g.append('g')
                .attr('class', 'node spouse-node')
                .attr('transform', `translate(${d.x + 90},${d.y})`)
                .style('cursor', 'pointer');

            // Spouse circle
            spouseG.append('circle')
                .attr('r', 30)
                .attr('fill', '#ec4899');

            // Spouse photo
            spouseG.append('image')
                .attr('x', -27)
                .attr('y', -27)
                .attr('width', 54)
                .attr('height', 54)
                .attr('clip-path', 'circle(27px)')
                .attr('href', d.data.spouse.photo || getPlaceholderImage('Perempuan', 1950, d.data.spouse.name));

            // Spouse name
            spouseG.append('text')
                .attr('class', 'name-label')
                .attr('dy', 50)
                .attr('text-anchor', 'middle')
                .style('font-size', '11px')
                .text(d.data.spouse.name.length > 15 ? d.data.spouse.name.substring(0, 15) + '...' : d.data.spouse.name);
        });
    }
}

function drawSpouseConnections() {
    const nodesWithSpouse = root.descendants().filter(d => d.data.spouse);

    g.selectAll('.spouse-connector')
        .data(nodesWithSpouse)
        .enter()
        .append('line')
        .attr('class', 'spouse-connector')
        .attr('x1', d => d.x + 35)
        .attr('y1', d => d.y)
        .attr('x2', d => d.x + 55)
        .attr('y2', d => d.y);
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================

function searchMember(query) {
    if (!query || !root) return;

    const lowerQuery = query.toLowerCase();
    const matchedNode = root.descendants().find(d =>
        d.data.data.nama.toLowerCase().includes(lowerQuery)
    );

    if (matchedNode) {
        // Remove previous highlight
        g.selectAll('.search-highlight').classed('search-highlight', false);

        // Add highlight to matched node
        const nodeSelection = g.selectAll('.node')
            .filter(d => d === matchedNode);

        nodeSelection.classed('search-highlight', true);

        // Calculate transform to center on node
        const scale = 1.5;
        const x = -matchedNode.x * scale + svg.attr('width') / 2;
        const y = -matchedNode.y * scale + svg.attr('height') / 2;

        // Animate to position
        svg.transition()
            .duration(750)
            .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));

        // Show detail after animation
        setTimeout(() => showDetail(matchedNode.data.data), 800);

        return true;
    } else {
        showNotFound(query);
        return false;
    }
}

// ============================================
// UI FUNCTIONS
// ============================================

function showDetail(data) {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('modalContent');

    // Populate data
    document.getElementById('modalName').textContent = formatName(data);
    document.getElementById('modalGender').querySelector('span').textContent = data.gender;
    document.getElementById('modalParent').textContent = data.bin || '-';
    document.getElementById('modalBirthPlace').textContent = data.tempat_lahir || '-';
    document.getElementById('modalBirthYear').textContent = data.tahun_lahir || '-';
    document.getElementById('modalAddress').textContent = data.alamat || '-';
    document.getElementById('modalPhone').textContent = data.no_hp || '-';
    document.getElementById('modalBio').textContent = data.bio || 'Tidak ada biografi.';

    // Status badge
    const statusEl = document.getElementById('modalStatus');
    if (isDeceased(data)) {
        statusEl.innerHTML = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><i data-lucide="moon" class="w-3 h-3 mr-1"></i>Alm/Almh</span>';
    } else {
        statusEl.innerHTML = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><i data-lucide="sun" class="w-3 h-3 mr-1"></i>Masih Hidup</span>';
    }

    // Photo
    const photoEl = document.getElementById('modalPhoto');
    photoEl.src = data.foto || getPlaceholderImage(data.gender, data.tahun_lahir, data.nama);
    photoEl.onerror = () => {
        photoEl.src = getPlaceholderImage(data.gender, data.tahun_lahir, data.nama);
    };

    // Death info
    const deathInfo = document.getElementById('modalDeathInfo');
    if (isDeceased(data)) {
        deathInfo.classList.remove('hidden');
        document.getElementById('modalDeathDetails').textContent =
            `${data.tempat_wafat || '-'}, ${data.tahun_wafat}`;
    } else {
        deathInfo.classList.add('hidden');
    }

    // Spouse info
    const spouseEl = document.getElementById('modalSpouse');
    if (data.pasangan && data.pasangan !== '-') {
        spouseEl.classList.remove('hidden');
        document.getElementById('modalSpouseName').textContent = data.pasangan;
        const spousePhoto = document.getElementById('modalSpousePhoto');
        spousePhoto.src = data.foto_pasangan || getPlaceholderImage('Perempuan', 1950, data.pasangan);
    } else {
        spouseEl.classList.add('hidden');
    }

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);

    // Re-create icons
    lucide.createIcons();
}

function closeDetail() {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('modalContent');

    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function showNotFound(name) {
    const dialog = document.getElementById('notFoundDialog');
    const content = document.getElementById('notFoundContent');

    document.getElementById('notFoundName').textContent = name;

    dialog.classList.remove('hidden');
    dialog.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeNotFound() {
    const dialog = document.getElementById('notFoundDialog');
    const content = document.getElementById('notFoundContent');

    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        dialog.classList.add('hidden');
        dialog.classList.remove('flex');
    }, 300);
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const messageEl = document.getElementById('toastMessage');

    messageEl.textContent = message;

    // Update icon based on type
    const icon = toast.querySelector('i');
    if (type === 'error') {
        icon.setAttribute('data-lucide', 'alert-circle');
        icon.classList.remove('text-green-400');
        icon.classList.add('text-red-400');
    } else {
        icon.setAttribute('data-lucide', 'check-circle');
        icon.classList.remove('text-red-400');
        icon.classList.add('text-green-400');
    }

    lucide.createIcons();

    toast.classList.remove('translate-y-20', 'opacity-0');

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

function resetView() {
    if (!svg || !root) return;

    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const bounds = getTreeBounds(root);
    const scale = Math.min(
        width / (bounds.width + 100),
        height / (bounds.height + 100),
        1
    );

    svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity
            .translate(width / 2 - bounds.cx * scale, 80)
            .scale(scale)
        );

    // Remove highlights
    g.selectAll('.search-highlight').classed('search-highlight', false);
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Initial load
    fetchFamilyData();

    // Search
    document.getElementById('searchBtn').addEventListener('click', () => {
        const query = document.getElementById('searchInput').value;
        searchMember(query);
    });

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchMember(e.target.value);
        }
    });

    // Toggle spouse
    document.getElementById('showSpouse').addEventListener('change', (e) => {
        showSpouseMode = e.target.checked;
        renderTree();
    });

    // Refresh
    document.getElementById('refreshBtn').addEventListener('click', () => {
        fetchFamilyData();
    });

    // Reset view
    document.getElementById('resetBtn').addEventListener('click', resetView);

    // Close modals
    document.getElementById('closeModal').addEventListener('click', closeDetail);
    document.getElementById('closeNotFound').addEventListener('click', closeNotFound);

    // Close modal on backdrop click
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeDetail();
    });

    document.getElementById('notFoundDialog').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeNotFound();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDetail();
            closeNotFound();
        }
    });

    // Window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (treeData) renderTree();
        }, 250);
    });

    // Auto refresh (opsional - bisa diaktifkan)
    // setInterval(fetchFamilyData, CONFIG.REFRESH_INTERVAL);
});