/**
 * Contact Verification Actions
 *
 * Handles email and phone verification via OTP tokens.
 */

export {
  sendEmailVerification,
  sendPhoneVerification,
} from './send-verification';

export {
  verifyContactToken,
  getVerificationStatus,
  adminVerifyContact,
  checkContactVerificationForRole,
} from './verify-contact';
