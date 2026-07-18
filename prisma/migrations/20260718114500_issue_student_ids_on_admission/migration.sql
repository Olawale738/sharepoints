UPDATE "AcademicCandidate"
SET
  "admissionDate" = COALESCE("admissionDate", "createdAt", NOW()),
  "studentIdNumber" = COALESCE(
    "studentIdNumber",
    'LETW-STU-' ||
      EXTRACT(YEAR FROM COALESCE("admissionDate", "createdAt", NOW()))::INT::TEXT ||
      '-' ||
      UPPER(SUBSTR(MD5("id" || COALESCE("email", '') || COALESCE("createdAt"::TEXT, '')), 1, 8))
  ),
  "studentIdIssuedAt" = COALESCE("studentIdIssuedAt", COALESCE("admissionDate", "createdAt", NOW())),
  "studentIdStatus" = COALESCE(NULLIF("studentIdStatus", ''), 'ACTIVE')
WHERE
  "studentIdNumber" IS NULL
  OR "studentIdIssuedAt" IS NULL
  OR "admissionDate" IS NULL;
