# After Getting MATIC - Setup Steps

## 1. Check MATIC Balance
```bash
node check-matic.js
```

## 2. Check USDC Allowance (should be 0)
```bash
node check-allowance.js
```

## 3. Approve USDC Spending (once you have MATIC)
```bash
node approve-usdc.js
```

## 4. Verify Approval
```bash
node check-allowance.js
```

## 5. Start Your Bot
```bash
npm start
```

---

**Your wallet address:** `0x67EDA02a8FF182DCCA8bE5D54553703B48Bf56C6`

**What you need:**
- At least 0.01 MATIC for gas fees
- This will allow you to approve USDC spending
- Then your bot can trade on Polymarket!
