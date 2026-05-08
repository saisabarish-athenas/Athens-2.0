# 🧪 PAYROLL & WAGES MODULE - INTEGRATION & TESTING GUIDE

## 🔗 API ENDPOINTS REFERENCE

### Payroll Cycles Management
```
GET    /api/workforce/payroll-cycles/
       - List all payroll cycles
       - Query params: None

POST   /api/workforce/payroll-cycles/
       - Create new payroll cycle
       - Body: { "cycle_name": "May 2026", "period_from": "2026-05-01", "period_to": "2026-05-31" }

GET    /api/workforce/payroll-cycles/{id}/
       - Get cycle details
       - Returns: cycle_name, period_from, period_to, status, processed_at

POST   /api/workforce/payroll-cycles/{id}/process/
       - Process payroll for all active employees
       - No body required
       - Updates: status → "processed", creates PayrollEntry records

POST   /api/workforce/payroll-cycles/{id}/lock/
       - Lock processed cycle (prevents further changes)
       - No body required
       - Updates: status → "locked"

POST   /api/workforce/payroll-cycles/{id}/pay-all/
       - Mark all processed entries as paid
       - Body: { "payment_mode": "bank" }
       - Updates: all entries → status "paid", records payment_date

GET    /api/workforce/payroll-cycles/{id}/entries/
       - List all entries in cycle
       - Query params: search, payment_status
       - Returns: Full PayrollEntry details
```

### Payroll Entries Management
```
GET    /api/workforce/payroll-entries/
       - List payroll entries
       - Query params: cycle, payment_status, search
       - Returns: Array of PayrollEntry objects

GET    /api/workforce/payroll-entries/{id}/
       - Get entry details
       - Returns: Complete PayrollEntry with related data

POST   /api/workforce/payroll-entries/{id}/process_single/
       - Process single entry (recalculate salary)
       - Recalculates: earnings, deductions, net_salary
       - Updates: status → "processed"

POST   /api/workforce/payroll-entries/{id}/pay/
       - Mark single entry as paid
       - Body: { "payment_mode": "bank", "transaction_reference": "" }
       - Updates: status → "paid", payment_date, paid_at

GET    /api/workforce/payroll-entries/{id}/payslip/
       - Generate payslip data
       - Returns: Complete payslip JSON with all details
       - Includes: earnings, deductions, employee info, payment status

GET    /api/workforce/payroll-entries/export/
       - Export payroll as CSV
       - Query params: cycle, payment_status
       - Returns: CSV file download
       - Filename: payroll_YYYY-MM.csv
```

---

## ⚡ QUICK START WORKFLOW

### 1. Create Payroll Cycle
```bash
curl -X POST http://localhost:8000/api/workforce/payroll-cycles/ \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "cycle_name": "May 2026",
    "period_from": "2026-05-01",
    "period_to": "2026-05-31"
  }'
```

### 2. Process Entire Cycle
```bash
curl -X POST http://localhost:8000/api/workforce/payroll-cycles/{cycle_id}/process/ \
  -H "Authorization: Bearer {token}"
```
- Creates PayrollEntry for each active employee
- Auto-calculates earnings & deductions
- Updates cycle status to "processed"

### 3. View All Entries
```bash
curl -X GET "http://localhost:8000/api/workforce/payroll-entries/?cycle={cycle_id}" \
  -H "Authorization: Bearer {token}"
```

### 4. Process Single Entry (If Needed)
```bash
curl -X POST http://localhost:8000/api/workforce/payroll-entries/{entry_id}/process_single/ \
  -H "Authorization: Bearer {token}"
```

### 5. Mark Payment (Single or Bulk)
```bash
# Single entry
curl -X POST http://localhost:8000/api/workforce/payroll-entries/{entry_id}/pay/ \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"payment_mode": "bank"}'

# All entries in cycle
curl -X POST http://localhost:8000/api/workforce/payroll-cycles/{cycle_id}/pay-all/ \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"payment_mode": "bank"}'
```

### 6. Get Payslip
```bash
curl -X GET http://localhost:8000/api/workforce/payroll-entries/{entry_id}/payslip/ \
  -H "Authorization: Bearer {token}"
```

### 7. Export Data
```bash
curl -X GET "http://localhost:8000/api/workforce/payroll-entries/export/?cycle={cycle_id}" \
  -H "Authorization: Bearer {token}" \
  -o payroll_export.csv
```

---

## 🧪 FRONTEND TESTING SCENARIOS

### Scenario 1: Process Payroll for New Month
**Steps:**
1. Open Payroll & Wages page
2. Select month via month input
3. See all entries in "pending" status
4. Click "Process" on first entry
5. Wait for spinner
6. See success toast: "✓ Payroll processed for [Name]"
7. Entry status changes to "blue/processed"
8. "Processed" KPI increments

**Expected Result:** ✅ Entry moves to "processed" status

---

### Scenario 2: Mark Payment
**Steps:**
1. With processed entries visible
2. Click "Pay" button on an entry
3. Wait for spinner
4. See success toast: "✓ Payment marked for [Name]"
5. Entry status changes to "green/paid"
6. "Paid" KPI increments
7. "Pending" & "Processed" KPIs decrement

**Expected Result:** ✅ Entry moves to "paid" status

---

### Scenario 3: View Payslip
**Steps:**
1. Click "Slip" button on any entry
2. Payslip modal opens
3. Verify all details display:
   - Employee name & ID
   - Department & designation
   - Payroll month
   - All earnings
   - All deductions
   - Net salary highlighted
4. Click "Print" → print dialog opens
5. Click close (X) → modal closes

**Expected Result:** ✅ Complete payslip displays correctly

---

### Scenario 4: Search Employees
**Steps:**
1. Type employee name in search box
2. Table filters in real-time
3. Only matching entries display
4. Clear search → shows all entries
5. Search by employee code → works

**Expected Result:** ✅ Search filters correctly

---

### Scenario 5: Filter by Status
**Steps:**
1. Select "Pending" from filter
2. Only pending entries display
3. Select "Processed" → updates table
4. Select "Paid" → updates table
5. Select "All Status" → shows all

**Expected Result:** ✅ Filter works correctly

---

### Scenario 6: Export Payroll
**Steps:**
1. Select a month
2. (Optional) Apply filters
3. Click "Export" button
4. File downloads: payroll_YYYY-MM.csv
5. Open CSV in spreadsheet app
6. Verify all data columns present

**Expected Result:** ✅ CSV file downloads with correct data

---

### Scenario 7: Month Selection
**Steps:**
1. Select different month
2. Table auto-updates with new data
3. KPI metrics update
4. Entries change to match month

**Expected Result:** ✅ Data updates for selected month

---

### Scenario 8: Error Handling
**Steps:**
1. Try to pay a pending entry
2. See error toast: "Payroll must be processed before payment"
3. Try to process already paid entry
4. See error toast: "Paid entries cannot be reprocessed"
5. Network error test (turn off internet, click button)
6. See generic error toast

**Expected Result:** ✅ Appropriate error messages display

---

## 🔍 BACKEND TESTING CHECKLIST

### Database Integrity
- [ ] PayrollEntry records created correctly
- [ ] All calculated fields have correct values
- [ ] payment_status updated correctly
- [ ] payment_date recorded for paid entries
- [ ] paid_at timestamp set
- [ ] Athens_tenant_id properly set
- [ ] payroll_cycle FK intact

### Status Workflow
- [ ] Entry starts as "pending"
- [ ] Process action changes to "processed"
- [ ] Pay action changes to "paid"
- [ ] Cannot change paid entry back
- [ ] Cannot pay pending entry
- [ ] Cannot reprocess paid entry

### Calculations
- [ ] basic_earned calculated correctly
- [ ] da_earned, hra_earned correct
- [ ] gross_salary = basic + DA + HRA + OT + allowances
- [ ] pf_employee calculated (basic × 12%)
- [ ] esi_employee calculated (gross × 0.75%)
- [ ] total_deductions accurate
- [ ] net_salary = gross - deductions

### API Responses
- [ ] 200 OK on successful process
- [ ] 400 Bad Request on invalid status
- [ ] 403 Forbidden for unauthorized users
- [ ] 404 Not Found for missing entry
- [ ] Error messages are descriptive

---

## ✅ VERIFICATION CHECKLIST

### Frontend Implementation
- [x] All buttons functional
- [x] Real API calls (no mock data)
- [x] Error handling implemented
- [x] Loading states visible
- [x] Toast notifications working
- [x] Modal for payslip
- [x] Export downloads CSV
- [x] Search working
- [x] Filter working
- [x] Dashboard metrics updating

### Backend Implementation
- [x] Process endpoint working
- [x] Pay endpoint working
- [x] Payslip endpoint working
- [x] Export endpoint working
- [x] Status validation
- [x] Tenant isolation
- [x] Permission checks
- [x] Error handling

### Database
- [x] PayrollEntry model correct
- [x] Relationships intact
- [x] Fields properly typed
- [x] Unique constraints set
- [x] Indexes on tenant_id
- [x] Cascade deletes configured

### Status Workflow
- [x] pending → processed transition
- [x] processed → paid transition
- [x] No invalid transitions allowed
- [x] Validations enforced
- [x] Double-processing prevented
- [x] Double-payment prevented

---

## 🚀 DEPLOYMENT CHECKLIST

Before deploying to production:

1. [ ] Run Django migrations
   ```bash
   python manage.py migrate
   ```

2. [ ] Collect static files
   ```bash
   python manage.py collectstatic --noinput
   ```

3. [ ] Test all endpoints with valid token

4. [ ] Test with multiple tenants

5. [ ] Verify error handling

6. [ ] Check logs for warnings

7. [ ] Test CSV export

8. [ ] Verify payslip generation

9. [ ] Test status workflow end-to-end

10. [ ] Load testing with multiple concurrent users

---

## 📊 SAMPLE TEST DATA

### Create Test Payroll Cycle
```bash
# 1. Get token
POST /api/auth/login/ → { "access": "token..." }

# 2. Create cycle
POST /api/workforce/payroll-cycles/
{
  "cycle_name": "May 2026",
  "period_from": "2026-05-01",
  "period_to": "2026-05-31"
}

# 3. Process
POST /api/workforce/payroll-cycles/{id}/process/

# 4. View entries
GET /api/workforce/payroll-entries/?cycle={cycle_id}

# 5. Process single
POST /api/workforce/payroll-entries/{entry_id}/process_single/

# 6. Pay single
POST /api/workforce/payroll-entries/{entry_id}/pay/
{ "payment_mode": "bank" }

# 7. Get payslip
GET /api/workforce/payroll-entries/{entry_id}/payslip/

# 8. Export
GET /api/workforce/payroll-entries/export/?cycle={cycle_id}
```

---

## 🐛 TROUBLESHOOTING

### Issue: "Payroll settings not configured"
**Solution:** 
```bash
POST /api/workforce/payroll-settings/
{
  "pf_rate": 12.00,
  "esi_rate": 0.75,
  "ot_multiplier": 2.00
}
```

### Issue: "Payroll must be processed before payment"
**Solution:** Process entry first by clicking "Process" button before "Pay"

### Issue: CSV export is empty
**Solution:** Ensure cycle exists and has entries, check payment_status filter

### Issue: Payslip modal not opening
**Solution:** Check browser console for errors, verify entry ID is correct

### Issue: Buttons not responding
**Solution:** Check network tab for API errors, verify auth token is valid

---

## 📞 SUPPORT

For issues or questions:

1. Check error toast message
2. Review browser console
3. Check server logs: `tail -f logs/django.log`
4. Verify database: `python manage.py dbshell`
5. Test with curl command

---

**Document Version:** 1.0  
**Last Updated:** May 7, 2026  
**Status:** Ready for Production ✅
