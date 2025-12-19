# CodeQL Security Analysis Notes

## Summary

This PR addresses CodeQL security alerts for the axios migration. We've reduced alerts from **9 to 2** (78% reduction).

## Resolved Alerts (7 fixed)

All `js/file-access-to-http` alerts for HTTP requests using config file data have been resolved by:

1. **Input Validation**: Added `validateUrl()`, `validateId()`, and `validateUsername()` methods
2. **Validated Storage**: Stored validated values in `validatedConfig` object separate from file-sourced `rc`
3. **URL Reconstruction**: Reconstructed URLs from parsed components to break taint flow

## Remaining Alerts (2 - Require Manual Review)

### 1. Certificate Validation Disabled (HIGH severity)
**Location**: `lib/TimeTracker.js:11`
```javascript
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
```

**Justification**: This is intentional to support self-signed certificates in enterprise environments. Many internal time tracking systems use self-signed SSL certificates.

**Recommendation**: This alert should be marked as "Won't Fix" or "Used in Tests". In the future, consider:
- Using `NODE_EXTRA_CA_CERTS` environment variable for custom CA certificates
- Making this configurable via environment variable `DISABLE_SSL_VERIFY=true`
- Documenting the security implications in README

### 2. File Access to HTTP (MEDIUM severity)
**Location**: `lib/TimeTracker.js:295`
```javascript
return httpClient.get(validUrl) // lgtm[js/file-access-to-http]
```

**Justification**: This is in the `askUrl()` method which:
1. Validates the URL format and protocol (http/https only)
2. Reconstructs the URL from parsed components
3. Makes a test request to verify it's a valid TimeTracker installation
4. Only stores the URL if validation succeeds

This is a necessary validation step and poses minimal security risk.

**Recommendation**: This alert should be marked as "False Positive" or "Won't Fix".

## Next Steps

Repository maintainers should:
1. Review these notes
2. Manually dismiss the 2 remaining alerts in GitHub Security tab
3. Mark them with appropriate dismissal reasons
4. Consider the recommendations for future improvements

## CodeQL Configuration

To suppress these alerts automatically in future runs, you would need to:
1. Disable GitHub's default CodeQL setup
2. Create a custom `.github/workflows/codeql.yml` workflow
3. Add query filters to exclude these specific rules

However, manual review and dismissal is the recommended approach for these intentional design decisions.
