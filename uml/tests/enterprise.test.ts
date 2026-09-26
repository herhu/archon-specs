
import { AsciiParser } from '../src/dsl/ascii.js';
import { transformIRToDesignSpec } from '../src/transform/spec.js';
import { inferMethodAndPath } from '../src/transform/utils/methodMatcher.js';
import * as fs from 'fs';
import * as path from 'path';

async function runTests() {
    console.log("🚀 Starting Enterprise UML Factory Unit Tests (v2)...\n");

    // --- 1. Test Semantic Method Matcher ---
    console.log("🧪 Testing Semantic Method Matcher...");
    const testCases = [
        { label: "createBooking(id)", expected: { method: "POST", path: "/createbooking" } },
        { label: "getBookingStatus(id)", expected: { method: "GET", path: "/getbookingstatus/:id" } },
        { label: "deleteBooking(id)", expected: { method: "DELETE", path: "/deletebooking/:id" } },
        { label: "listBookings()", expected: { method: "GET", path: "/listbookings" } },
        { label: "updateSeat(id, seat)", expected: { method: "PATCH", path: "/updateseat/:id" } }
    ];

    for (const tc of testCases) {
        const result = inferMethodAndPath(tc.label);
        if (result.method === tc.expected.method && result.path === tc.expected.path) {
            console.log(`✅ [PASS] ${tc.label} -> ${result.method} ${result.path}`);
        } else {
            console.log(`❌ [FAIL] ${tc.label} -> Expected ${tc.expected.method} ${tc.expected.path}, got ${result.method} ${result.path}`);
        }
    }

    // --- 2. Test End-to-End Transformation ---
    console.log("\n🧪 Testing End-to-End Transformation (Mockup Data)...");
    const mockupPath = path.join(process.cwd(), 'tests', 'mockup.uml.txt');
    const mockupDsl = fs.readFileSync(mockupPath, 'utf8');

    const parser = new AsciiParser();
    const ir = parser.parse(mockupDsl);
    const spec = transformIRToDesignSpec(ir);

    // Verify Multiplicity & Nullable
    const commercial = spec.domains.find(d => d.name === 'Commercial');
    const booking = commercial?.entities.find(e => e.name === 'Booking');
    
    // Test: passengerId should be nullable because multiplicity of Passenger is 0..1
    const passengerIdField = booking?.fields.find(f => f.name === 'passengerId');
    if (passengerIdField && passengerIdField.nullable === true) {
        console.log("✅ [PASS] Multiplicity 0..1 on target correctly mapped to nullable:true");
    } else {
        console.log("❌ [FAIL] Multiplicity 0..1 failed to map to nullable:true. Got: " + (passengerIdField ? passengerIdField.nullable : 'field not found'));
    }

    // Test: PK tag support
    const flight = commercial?.entities.find(e => e.name === 'Flight');
    const flightId = flight?.fields.find(f => f.name === 'id');
    if (flightId?.primary === true) {
        console.log("✅ [PASS] PK tag correctly mapped to primary:true");
    } else {
        console.log("❌ [FAIL] PK tag failed to map to primary:true");
    }

    // Test: FK tag & Relation reconciliation
    const passengerRel = booking?.relationships?.find(r => r.targetEntity === 'Passenger');
    if (passengerRel?.joinColumn === 'passengerId') {
        console.log("✅ [PASS] Relationship correctly bound to explicit [FK] field 'passengerId'");
    } else {
        console.log("❌ [FAIL] Relationship failed to bind to explicit [FK] field. Got: " + passengerRel?.joinColumn);
        // Print all fields in Booking to see what happened
        console.log("DEBUG: Booking fields: " + JSON.stringify(booking?.fields.map(f => f.name)));
    }

    // Verify Sequence Diagram Methods in Spec
    const bookingService = commercial?.services.find(s => s.name === 'BookingService');
    const getOp = bookingService?.operations?.find(o => o.name === 'getBookingStatus');
    if (getOp?.method === 'GET' && getOp.path.includes(':id')) {
        console.log("✅ [PASS] Sequence Diagram semantic GET method & path params persisted in Service Shard");
    } else {
        console.log("❌ [FAIL] Service Operation logic failed. Got: " + JSON.stringify(getOp));
        if (bookingService) {
            console.log("DEBUG: BookingService operations: " + JSON.stringify(bookingService.operations?.map(o => o.name)));
        } else {
            console.log("DEBUG: BookingService not found in domain Commercial");
        }
    }

    console.log("\n🏁 All tests completed.");
    if (process.env.DEBUG === 'true') {
        fs.writeFileSync('tests/output.spec.json', JSON.stringify(spec, null, 2));
    }
}

runTests().catch(err => {
    console.error("💥 Test runner crashed!");
    console.error(err);
    process.exit(1);
});
