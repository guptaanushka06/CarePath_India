/**
 * Generates a unique referral code in the format:
 *   REF-MH-YYYY-XXXXX
 *
 * MH = Maharashtra
 * YYYY = current year
 * XXXXX = random 5-digit number
 */
export const generateReferralCode = () => {
    const year = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000); // 5-digit
    return `REF-MH-${year}-${random}`;
};
