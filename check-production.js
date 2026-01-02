// Script to check production site health
const https = require('https');
const http = require('http');

const site = 'www.thebigmotherfucker.com';

function checkEndpoint(path, useHttps = true) {
    return new Promise((resolve, reject) => {
        const protocol = useHttps ? https : http;
        const url = `${useHttps ? 'https' : 'http'}://${site}${path}`;
        
        console.log(`\nChecking: ${url}`);
        
        protocol.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        console.log('Response:', JSON.stringify(json, null, 2).substring(0, 500));
                        resolve({ status: res.statusCode, data: json });
                    } catch (e) {
                        console.log('Response (not JSON):', data.substring(0, 200));
                        resolve({ status: res.statusCode, data: data });
                    }
                } else {
                    console.log('Response:', data.substring(0, 200));
                    resolve({ status: res.statusCode, data: data });
                }
            });
        }).on('error', (error) => {
            console.error('Error:', error.message);
            reject(error);
        }).setTimeout(10000, () => {
            console.error('Timeout after 10 seconds');
            reject(new Error('Timeout'));
        });
    });
}

async function runChecks() {
    console.log('=== Production Site Health Check ===\n');
    
    try {
        await checkEndpoint('/health');
        await checkEndpoint('/api/stocks/current');
        await checkEndpoint('/api/stocks/monthly?mock=true');
        
        console.log('\n✅ Checks completed!');
        console.log('\nIf endpoints return 404 or errors, the server may not be running or routes are not configured.');
    } catch (error) {
        console.error('\n❌ Check failed:', error.message);
    }
}

runChecks();

