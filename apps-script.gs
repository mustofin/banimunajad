/**
 * ============================================
 * GOOGLE APPS SCRIPT - Family Tree Data API
 * ============================================
 * 
 * Cara Setup:
 * 1. Buka Google Sheets dengan data keluarga
 * 2. Extensions > Apps Script
 * 3. Hapus kode default, paste kode ini
 * 4. Simpan (Ctrl+S)
 * 5. Deploy > New Deployment
 * 6. Pilih Type: Web App
 * 7. Execute as: Me
 * 8. Who has access: Anyone
 * 9. Deploy
 * 10. Copy URL deployment, paste ke CONFIG.SCRIPT_URL di script.js
 */

// ============================================
// CONFIGURATION
// ============================================

const SHEET_NAME = 'Data Keluarga'; // Ganti dengan nama sheet Anda
const DATA_RANGE = 'A2:M'; // Range data (tanpa header)

// Header yang diharapkan:
// A: id, B: nama, C: bin, D: orang_tua, E: gender, F: alamat, 
// G: no_hp, H: tahun_lahir, I: tempat_lahir, J: tahun_wafat, 
// K: tempat_wafat, L: foto, M: pasangan, N: foto_pasangan, O: bio

// ============================================
// WEB APP ENDPOINTS
// ============================================

function doGet(e) {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    
    try {
        const data = getFamilyData();
        
        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            data: data,
            timestamp: new Date().toISOString(),
            count: data.length
        })).setMimeType(ContentService.MimeType.JSON);
        
    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function doOptions(e) {
    return ContentService.createTextOutput('')
        .setMimeType(ContentService.MimeType.TEXT);
}

// ============================================
// DATA FUNCTIONS
// ============================================

function getFamilyData() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
        throw new Error(`Sheet "${SHEET_NAME}" tidak ditemukan!`);
    }
    
    const dataRange = sheet.getRange(DATA_RANGE);
    const values = dataRange.getValues();
    
    const result = [];
    const nameToIdMap = new Map();
    
    // First pass: parsing and mapping
    for (let i = 0; i < values.length; i++) {
        const row = values[i];
        
        // Skip empty rows
        if (!row[0] || row[0].toString().trim() === '') continue;
        
        const record = {
            id: row[0].toString(),
            nama: row[1] ? row[1].toString() : '',
            bin: row[2] ? row[2].toString() : '',
            orang_tua: row[3] ? row[3].toString() : '',
            gender: row[4] ? row[4].toString() : '',
            alamat: row[5] ? row[5].toString() : '',
            no_hp: row[6] ? row[6].toString() : '',
            tahun_lahir: row[7] ? row[7].toString() : '',
            tempat_lahir: row[8] ? row[8].toString() : '',
            tahun_wafat: row[9] ? row[9].toString() : '',
            tempat_wafat: row[10] ? row[10].toString() : '',
            foto: row[11] ? row[11].toString() : '',
            pasangan: row[12] ? row[12].toString() : '',
            foto_pasangan: row[13] ? row[13].toString() : '',
            bio: row[14] ? row[14].toString() : ''
        };
        
        // Convert Google Drive links
        record.foto = processImageUrl(record.foto);
        record.foto_pasangan = processImageUrl(record.foto_pasangan);
        
        result.push(record);
        
        if (record.nama) {
            nameToIdMap.set(record.nama.trim().toLowerCase(), record.id);
        }
    }
    
    // Second pass: linking parents
    result.forEach(record => {
        // Default: use what's in orang_tua if it looks like an ID (digits only)
        if (record.orang_tua && record.orang_tua.match(/^\d+$/)) {
             record.parent_id = record.orang_tua;
        } 
        // Logic lookup by name
        else if (record.orang_tua && record.orang_tua.trim() !== '' && record.orang_tua !== '-') {
             const parentName = record.orang_tua.trim().toLowerCase();
             if (nameToIdMap.has(parentName)) {
                 record.parent_id = nameToIdMap.get(parentName);
             } else {
                 record.parent_id = null;
             }
        } else {
             record.parent_id = null;
        }
    });
    
    return result;
}

/**
 * Mengkonversi berbagai format URL gambar ke URL langsung
 */
function processImageUrl(url) {
    if (!url || url.trim() === '') return '';
    
    // Google Drive file ID extraction
    const driveMatch = url.match(/[-\w]{25,}/);
    if (driveMatch) {
        return `https://drive.google.com/uc?export=view&id=${driveMatch[0]}`;
    }
    
    // Google Drive open link format
    if (url.includes('drive.google.com/file/d/')) {
        const match = url.match(/\/d\/([-\w]+)/);
        if (match) {
            return `https://drive.google.com/uc?export=view&id=${match[1]}`;
        }
    }
    
    // Google Drive open link format (alternate)
    if (url.includes('drive.google.com/open?id=')) {
        const match = url.match(/id=([-\w]+)/);
        if (match) {
            return `https://drive.google.com/uc?export=view&id=${match[1]}`;
        }
    }
    
    return url;
}

// ============================================
// UTILITY FUNCTIONS (Optional)
// ============================================

/**
 * Fungsi untuk menambah data baru via API
 */
function doPost(e) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };
    
    try {
        const data = JSON.parse(e.postData.contents);
        
        // Validasi data minimal
        if (!data.id || !data.nama) {
            throw new Error('ID dan Nama wajib diisi');
        }
        
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(SHEET_NAME);
        
        // Cek apakah ID sudah ada
        const existingData = getFamilyData();
        const exists = existingData.find(r => r.id === data.id);
        
        if (exists) {
            // Update existing
            updateRecord(sheet, data);
            return ContentService.createTextOutput(JSON.stringify({
                success: true,
                message: 'Data berhasil diupdate',
                action: 'update'
            })).setMimeType(ContentService.MimeType.JSON);
        } else {
            // Add new
            addRecord(sheet, data);
            return ContentService.createTextOutput(JSON.stringify({
                success: true,
                message: 'Data berhasil ditambahkan',
                action: 'create'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        
    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function addRecord(sheet, data) {
    const row = [
        data.id,
        data.nama,
        data.bin || '',
        data.orang_tua || '',
        data.gender || '',
        data.alamat || '',
        data.no_hp || '',
        data.tahun_lahir || '',
        data.tempat_lahir || '',
        data.tahun_wafat || '',
        data.tempat_wafat || '',
        data.foto || '',
        data.pasangan || '',
        data.foto_pasangan || '',
        data.bio || ''
    ];
    
    sheet.appendRow(row);
}

function updateRecord(sheet, data) {
    const dataRange = sheet.getRange(DATA_RANGE);
    const values = dataRange.getValues();
    
    for (let i = 0; i < values.length; i++) {
        if (values[i][0].toString() === data.id) {
            const rowNum = i + 2; // +2 karena data mulai dari baris 2
            
            sheet.getRange(rowNum, 2).setValue(data.nama);
            sheet.getRange(rowNum, 3).setValue(data.bin || '');
            sheet.getRange(rowNum, 4).setValue(data.orang_tua || '');
            sheet.getRange(rowNum, 5).setValue(data.gender || '');
            sheet.getRange(rowNum, 6).setValue(data.alamat || '');
            sheet.getRange(rowNum, 7).setValue(data.no_hp || '');
            sheet.getRange(rowNum, 8).setValue(data.tahun_lahir || '');
            sheet.getRange(rowNum, 9).setValue(data.tempat_lahir || '');
            sheet.getRange(rowNum, 10).setValue(data.tahun_wafat || '');
            sheet.getRange(rowNum, 11).setValue(data.tempat_wafat || '');
            sheet.getRange(rowNum, 12).setValue(data.foto || '');
            sheet.getRange(rowNum, 13).setValue(data.pasangan || '');
            sheet.getRange(rowNum, 14).setValue(data.foto_pasangan || '');
            sheet.getRange(rowNum, 15).setValue(data.bio || '');
            
            break;
        }
    }
}

// ============================================
// TEST FUNCTIONS (Run dari Apps Script editor)
// ============================================

function testGetData() {
    const data = getFamilyData();
    Logger.log(JSON.stringify(data, null, 2));
    Logger.log(`Total records: ${data.length}`);
}

function testProcessImage() {
    const testUrls = [
        'https://drive.google.com/file/d/ABC123/view',
        'https://drive.google.com/open?id=ABC123',
        'ABC123',
        'https://example.com/image.jpg'
    ];
    
    testUrls.forEach(url => {
        Logger.log(`${url} => ${processImageUrl(url)}`);
    });
}