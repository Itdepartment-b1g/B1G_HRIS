# Fixing `ERR_CERT_AUTHORITY_INVALID` on b1ghris.vercel.app

The `NET::ERR_CERT_AUTHORITY_INVALID` error means Chrome does **not** trust the SSL certificate presented by the site. For `b1ghris.vercel.app` (a Vercel subdomain), this is usually **not** a Vercel-side configuration issue—it's often caused by your network or local environment.

---

## Step 1: Check if it's just you (most likely)

The problem often affects only certain users/networks. Check:

1. **Different device** – Try your phone on mobile data (not Wi‑Fi).
2. **Incognito** – Open an Incognito/Private window and visit `https://b1ghris.vercel.app`.
3. **Different network** – Try another Wi‑Fi, mobile hotspot, or home connection.

If it works in any of these cases, the issue is likely your current network or device.

---

## Step 2: Rule out local interception (MITM)

Tools that intercept HTTPS traffic can cause this error:

| Tool/Setup          | What to do                         |
|---------------------|------------------------------------|
| **VPN**             | Turn off VPN and try again         |
| **Charles Proxy / Fiddler / Burp** | Disable or quit them         |
| **Antivirus with web scanning**     | Temporarily disable HTTPS scanning |
| **Corporate firewall / proxy**     | Use a personal network to test      |

---

## Step 3: Inspect the certificate (diagnostics)

Use Chrome DevTools to see which certificate is used:

1. Open the page, then press **F12** (or right‑click → Inspect).
2. Go to the **Security** tab.
3. Click **View certificate**.
4. Look at:
   - **Issued to** – should relate to Vercel/Let’s Encrypt.
   - **Certificate chain** – should show a trusted CA (e.g. Let’s Encrypt).
   - **Validity period** – should be current.

If you see:
- **Issued to:** your company, antivirus, or proxy → local interception (VPN/proxy/firewall).
- **Self‑signed** → also usually local interception.

---

## Step 4: Clear HSTS and site data (if site used to work)

Chrome’s HSTS cache can keep old, bad cert info. Try:

1. Open: `chrome://net-internals/#hsts`
2. Under “Delete domain security policies”, enter: `b1ghris.vercel.app`
3. Click **Delete**.
4. Visit: `chrome://settings/siteData`
5. Search for `b1ghris.vercel.app` → remove its data.
6. Close Chrome fully and reopen, then visit the site again.

---

## Step 5: Vercel-side checks (less common for `*.vercel.app`)

For `b1ghris.vercel.app` as a **Vercel subdomain**, SSL is normally automatic. Do these only if:

- Others on different networks also see the error, or
- You added `b1ghris.vercel.app` as a **custom domain** to the project.

### If it’s a custom domain

1. Vercel Dashboard → your project → **Settings** → **Domains**.
2. Find `b1ghris.vercel.app` and confirm:
   - Status is **Valid** (not “Pending”).
   - DNS shows the correct `CNAME` (e.g. `cname.vercel-dns.com`).
3. If DNS was recently changed, allow **up to 24–48 hours** for propagation.
4. **Force certificate refresh**: remove the domain, wait a few minutes, add it again.

### If it’s a regular Vercel subdomain

1. Try the default deployment URL instead (e.g. `b1ghris-abc123.vercel.app` or similar in the Deployment URL list).
2. If that works, the SSL error on `b1ghris.vercel.app` is likely specific to that domain or its assignment.

---

## Step 6: Alternative URL

If `b1ghris.vercel.app` keeps failing:

1. In Vercel → Project → **Deployments**.
2. Click the latest deployment.
3. Copy the deployment URL (often like `b1ghris-xxx.vercel.app`).

Use this URL as a temporary workaround until the main domain is fixed.

---

## Quick reference: what’s happening

| Symptom                              | Likely cause                         |
|--------------------------------------|--------------------------------------|
| Only you see it on one network       | VPN, proxy, or corporate firewall    |
| Works on phone data, fails on Wi‑Fi  | Wi‑Fi network intercepts HTTPS       |
| Antivirus / proxy installed          | MITM replacing the certificate      |
| Everyone sees it on all networks     | Vercel/cert config (rare for *.vercel.app) |

---

## External references

- [GitHub discussion on ERR_CERT_AUTHORITY_INVALID](https://github.com/vercel/vercel/discussions/6237) – certificate inspection and MITM causes.
- [Vercel – Working with SSL](https://vercel.com/docs/domains/working-with-ssl)
- [Vercel – Troubleshooting domains](https://vercel.com/docs/domains/troubleshooting)
