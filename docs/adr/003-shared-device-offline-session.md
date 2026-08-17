# ADR-003: Shared Counter Device dan Bound Offline Lease

- Status: Accepted
- Date: 2026-08-17

## Context

Counter merchant dipakai bergantian. Mengikat device permanen ke Owner/pembuat device membuat attribution sale salah, sementara unrestricted offline user switching tidak dapat diautentikasi aman.

## Decision

Device terikat ke merchant, bukan user. Online login mengikat active Operator session ke device dan menerbitkan signed offline lease tujuh hari untuk merchant/user/device tersebut. Browser restart offline boleh membuka last Operator; pergantian Operator harus online. Access token 15 menit di memory dan rotating refresh session tujuh hari memakai secure HttpOnly cookie.

## Consequences

Checkout tahan restart tetapi offline session bukan multi-user selector. Revocation tidak dapat menarik data dari browser yang benar-benar offline, namun backend menolak sync/session baru dan local queue tetap dipertahankan untuk controlled recovery.
