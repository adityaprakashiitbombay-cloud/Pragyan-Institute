# 🆔 Pragyan Institute — Student ID & Numbering Standards

---

## 1. The Canonical `YYCCXX` Student ID Format

All student records at Pragyan Institute are identified by a standardized 6-digit numeric identifier:

$$\mathbf{\text{Student ID}} = \mathbf{YY} + \mathbf{CC} + \mathbf{XX}$$

### Format Definition:
1. **`YY` (Academic Year / Admission Year - 2 digits)**:
   - Example: Year 2026 ➔ `26`
   - Generated via: `new Date().getFullYear().toString().slice(-2)`
2. **`CC` (Class / Batch Code - 2 digits)**:
   - Class 6th ➔ `06`
   - Class 7th (Junior) ➔ `07`
   - Class 8th (ALPHA) ➔ `08`
   - Class 9th (NURTURE) ➔ `09`
   - Class 10th (ACHIEVER / Board) ➔ `10`
   - Class 11th (TARGET 11) ➔ `11`
   - Class 12th (TARGET 12) ➔ `12`
3. **`XX` (Sequential Roll / Serial Number - 2 digits)**:
   - `01`, `02`, `03`... `99` (padded with leading zeros).
   - Dynamically calculated by finding `maxSerial` among existing students in that `${YY}${CC}` batch and adding `1`.

### Canonical Examples:
- **`261001`**: 1st Student in Class 10th for the Year 2026.
- **`261002`**: 2nd Student in Class 10th for the Year 2026.
- **`260901`**: 1st Student in Class 9th for the Year 2026.
- **`261101`**: 1st Student in Class 11th for the Year 2026.
- **`261201`**: 1st Student in Class 12th for the Year 2026.

---

## 2. Multi-Identifier Matching Helper (`isStudentRequestMatch`)

Because students can be referenced across different tables and sessions by `student_id` (`'261001'`), `id` (`UUID`), `roll_no`, or `mobile`, the portal uses a unified matching helper:

```javascript
function isStudentRequestMatch(req, student) {
  if (!req || !student) return false;
  const sId = (student.id || student.student_id || '').toString().trim().toLowerCase();
  const sRoll = (student.rollNo || student.roll_no || '').toString().trim().toLowerCase();
  const sMob = (student.mobile || student.guardianMobile || '').toString().trim().slice(-10);

  const rTarget = (req.studentId || req.student_id || '').toString().trim().toLowerCase();
  const rRoll = (req.rollNo || req.roll_no || '').toString().trim().toLowerCase();
  const rMob = (req.oldData?.mobile || req.newData?.mobile || req.old_data?.mobile || req.new_data?.mobile || '').toString().trim().slice(-10);

  if (sId && (rTarget === sId || rRoll === sId)) return true;
  if (sRoll && (rTarget === sRoll || rRoll === sRoll)) return true;
  if (sMob && rMob && sMob.length >= 10 && sMob === rMob) return true;
  return false;
}
```

---

## 3. High-Density Code-128 Logical Barcode

The student's 3D VIP ID Card dynamically generates a pure vector SVG barcode (`generateStudentLogicalBarcodeSVG(s)`):
- Encodes the `YYCCXX` identifier using standard Code-128 / Code-39 binary pattern bitsets.
- Applies standard 10x quiet zones on both left and right edges for accurate handheld optical scanner recognition.
