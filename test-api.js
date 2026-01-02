// Simple test script to debug API endpoints
const http = require('http');

const testEndpoint = (path, description) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log(`\n=== ${description} ===`);
                console.log(`Status: ${res.statusCode}`);
                console.log(`Response:`);
                try {
                    const json = JSON.parse(data);
                    console.log(JSON.stringify(json, null, 2));
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    console.log(data);
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (error) => {
            console.error(`\n=== ${description} ERROR ===`);
            console.error(error.message);
            reject(error);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
};

async function runTests() {
    console.log('Testing API endpoints...\n');
    
    try {
        // Test health endpoint
        await testEndpoint('/health', 'Health Check');
        
        // Test current stocks endpoint
        await testEndpoint('/api/stocks/current', 'Current Stocks');
        
        // Test monthly stocks endpoint
        await testEndpoint('/api/stocks/monthly', 'Monthly Stocks');
        
        // Test monthly stocks with mock
        await testEndpoint('/api/stocks/monthly?mock=true', 'Monthly Stocks (Mock)');
        
        console.log('\n✅ All tests completed!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

runTests();

