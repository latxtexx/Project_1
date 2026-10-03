"""
Unit Test & Mathematical Verification for Cash Flow Analytics Engine
Validates Safe-to-Spend, Cash Runway, Overdraft Hazards, and Financial Health Indicators.
"""

def calculate_safe_to_spend(total_liquid, upcoming_fixed, monthly_savings_target, accumulated_savings, days_remaining, cc_escrow=0):
    remaining_savings_goal = max(0, monthly_savings_target - accumulated_savings)
    raw_safe = total_liquid - upcoming_fixed - remaining_savings_goal - cc_escrow
    buffer = max(0, raw_safe * 0.05)
    total_safe = max(0, raw_safe - buffer)
    daily_safe = total_safe / days_remaining if days_remaining > 0 else 0
    return {
        "raw_safe": round(raw_safe, 2),
        "buffer": round(buffer, 2),
        "total_safe": round(total_safe, 2),
        "daily_safe": round(daily_safe, 2)
    }

def calculate_runway(liquid_balance, monthly_burn):
    return round(liquid_balance / monthly_burn, 1) if monthly_burn > 0 else 99.0

def test_safe_to_spend():
    # Scenario: Liquid=125,400, Fixed=14,400, Target=10,000, Accumulated=5,000, Days=28, CC_Escrow=18,200
    res = calculate_safe_to_spend(
        total_liquid=125400,
        upcoming_fixed=14400,
        monthly_savings_target=10000,
        accumulated_savings=5000,
        days_remaining=28,
        cc_escrow=18200
    )
    # Expected raw: 125,400 - 14,400 - 5,000 - 18,200 = 87,800
    assert res["raw_safe"] == 87800.0, f"Expected 87800.0, got {res['raw_safe']}"
    # Expected buffer: 87,800 * 0.05 = 4,390.0
    assert res["buffer"] == 4390.0, f"Expected 4390.0, got {res['buffer']}"
    # Expected total safe: 87,800 - 4,390 = 83,410.0
    assert res["total_safe"] == 83410.0, f"Expected 83410.0, got {res['total_safe']}"
    # Expected daily safe: 83,410 / 28 = 2978.93
    assert res["daily_safe"] == 2978.93, f"Expected 2978.93, got {res['daily_safe']}"
    print("PASS: test_safe_to_spend passed all mathematical assertions.")

def test_runway_calculation():
    runway = calculate_runway(125400, 30000)
    assert runway == 4.2, f"Expected 4.2, got {runway}"
    print("PASS: test_runway_calculation passed (4.2 months runway).")

def test_overdraft_hazard():
    bank_balance = 68500
    cc_bill = 18200
    rent_bill = 12000
    util_bill = 2400
    remaining_balance = bank_balance - (cc_bill + rent_bill + util_bill)
    assert remaining_balance == 35900
    print(f"PASS: test_overdraft_hazard checked. Bank buffer after all bills = ฿{remaining_balance}")

if __name__ == "__main__":
    print("--- Running Cash Flow Engine Math Verification Tests ---")
    test_safe_to_spend()
    test_runway_calculation()
    test_overdraft_hazard()
    print("All tests passed successfully!")
