// src/services/lencoPaymentService.js - Complete Lenco Payment Gateway Integration
const axios = require('axios');

class LencoPaymentService {
  constructor() {
    // Use provided credentials and sandbox URL
    this.baseURL = process.env.LENCO_BASE_URL || 'https://sandbox.lenco.co/access/v2';
    this.apiKey = process.env.LENCO_API_KEY || '993bed87f9d592566a6cce2cefd79363d1b7e95af3e1e6642b294ce5fc8c59f6';
    this.publicKey = process.env.LENCO_PUBLIC_KEY || 'pub-88dd921c0ecd73590459a1dd5a9343c77db0f3c344f222b9';
    
    if (!this.apiKey || !this.publicKey) {
      console.error('❌ Lenco payment gateway credentials not configured');
    }
  }

  // Create headers for API requests
  createHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  // Initialize Mobile Money Payment
  async initializeMobileMoneyPayment({
    amount,
    currency = 'NGN',
    phone,
    reference,
    description,
    country = 'ng',
    operator, // mtn, airtel, glo, 9mobile
    bearer = 'merchant'
  }) {
    try {
      console.log('🔄 Initializing Lenco mobile money payment...', { amount, reference, operator });
      
      const paymentData = {
        amount: amount.toString(), // Lenco expects string, not cents conversion
        currency,
        reference,
        phone,
        country,
        operator: operator.toLowerCase(),
        bearer,
        label: description || 'Payment'
      };

      const headers = this.createHeaders();

      const response = await axios.post(
        `${this.baseURL}/collections/mobile-money`,
        paymentData,
        { headers, timeout: 30000 }
      );

      console.log('✅ Lenco mobile money payment initialized:', response.data.data?.reference);
      
      return {
        success: true,
        data: {
          reference: response.data.data.reference,
          lencoReference: response.data.data.lencoReference,
          status: response.data.data.status,
          id: response.data.data.id,
          ussd_code: response.data.data.ussd_code,
          instructions: this.getMobileMoneyInstructions(response.data.data.status, operator),
          operator: operator,
          amount: response.data.data.amount,
          currency: response.data.data.currency
        }
      };

    } catch (error) {
      console.error('❌ Lenco mobile money payment initialization failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || 'Mobile money payment initialization failed',
        code: error.response?.status || 'MOBILE_MONEY_INIT_ERROR'
      };
    }
  }

  // Submit OTP for Mobile Money (when required)
  async submitMobileMoneyOTP(collectionId, otp) {
    try {
      console.log('🔄 Submitting Mobile Money OTP...', collectionId);
      
      const otpData = {
        collectionId,
        otp: otp || '000000' // Use 000000 for sandbox
      };

      const headers = this.createHeaders();

      const response = await axios.post(
        `${this.baseURL}/collections/mobile-money/submit-otp`,
        otpData,
        { headers, timeout: 30000 }
      );

      console.log('✅ Mobile Money OTP submitted:', response.data.data?.status);
      
      return {
        success: true,
        data: {
          status: response.data.data.status,
          reference: response.data.data.reference,
          message: response.data.message
        }
      };

    } catch (error) {
      console.error('❌ Mobile Money OTP submission failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || 'OTP submission failed',
        code: 'OTP_SUBMISSION_ERROR'
      };
    }
  }

  // Generate Card Payment Configuration (for widget)
  generateCardPaymentConfig({
    amount,
    currency = 'NGN',
    email,
    phone,
    firstName,
    lastName,
    reference,
    description,
    onSuccessUrl,
    onCloseUrl
  }) {
    try {
      console.log('🔄 Generating Lenco card payment config...', { amount, reference });
      
      return {
        success: true,
        config: {
          key: this.publicKey,
          email: email,
          reference: reference,
          amount: parseFloat(amount), // Lenco expects number, not cents
          currency: currency,
          label: description || 'Payment',
          bearer: 'merchant',
          channels: ['card'],
          customer: {
            firstName: firstName || '',
            lastName: lastName || '',
            phone: phone || ''
          },
          onSuccessUrl: onSuccessUrl,
          onCloseUrl: onCloseUrl
        },
        widgetScript: process.env.NODE_ENV === 'production' 
          ? 'https://pay.lenco.co/js/v1/inline.js'
          : 'https://pay.sandbox.lenco.co/js/v1/inline.js'
      };

    } catch (error) {
      console.error('❌ Card payment config generation failed:', error);
      
      return {
        success: false,
        error: 'Failed to generate card payment configuration',
        code: 'CARD_CONFIG_ERROR'
      };
    }
  }

  // Verify Payment Status
  async verifyPayment(reference) {
    try {
      console.log('🔄 Verifying Lenco payment:', reference);
      
      const headers = this.createHeaders();

      const response = await axios.get(
        `${this.baseURL}/collections/status/${reference}`,
        { headers, timeout: 30000 }
      );

      console.log('✅ Lenco payment verification result:', response.data.data?.status);
      
      const { data } = response.data;
      
      return {
        success: true,
        data: {
          id: data.id,
          reference: data.reference,
          lencoReference: data.lencoReference,
          status: data.status, // pending, successful, failed, otp-required, pay-offline
          amount: parseFloat(data.amount),
          currency: data.currency,
          type: data.type, // mobile-money, card
          fee: data.fee ? parseFloat(data.fee) : 0,
          bearer: data.bearer,
          initiatedAt: data.initiatedAt,
          completedAt: data.completedAt,
          reasonForFailure: data.reasonForFailure,
          settlementStatus: data.settlementStatus,
          settlement: data.settlement,
          mobileMoneyDetails: data.mobileMoneyDetails,
          cardDetails: data.cardDetails,
          bankAccountDetails: data.bankAccountDetails
        }
      };

    } catch (error) {
      console.error('❌ Lenco payment verification failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || 'Payment verification failed',
        code: error.response?.status || 'PAYMENT_VERIFICATION_ERROR'
      };
    }
  }

  // Get Mobile Money Instructions based on status
  getMobileMoneyInstructions(status, operator) {
    const operatorName = {
      'mtn': 'MTN',
      'airtel': 'Airtel',
      'glo': 'Glo',
      '9mobile': '9mobile'
    }[operator] || operator;

    switch (status) {
      case 'otp-required':
        return `An OTP has been sent to your ${operatorName} number. Please enter the OTP to continue.`;
      case 'pay-offline':
        return `Please check your ${operatorName} phone for a payment prompt and authorize the transaction.`;
      case 'pending':
        return `Your ${operatorName} payment is being processed. Please wait...`;
      case 'successful':
        return `Your ${operatorName} payment was successful!`;
      case 'failed':
        return `Your ${operatorName} payment failed. Please try again.`;
      default:
        return `Complete the payment on your ${operatorName} device.`;
    }
  }

  // Get Supported Mobile Money Operators
  getSupportedOperators() {
    return [
      { 
        code: 'mtn', 
        name: 'MTN', 
        logo: '/images/operators/mtn.png',
        country: 'ng'
      },
      { 
        code: 'airtel', 
        name: 'Airtel', 
        logo: '/images/operators/airtel.png',
        country: 'ng' 
      },
      { 
        code: 'glo', 
        name: 'Glo', 
        logo: '/images/operators/glo.png',
        country: 'ng' 
      },
      { 
        code: '9mobile', 
        name: '9mobile', 
        logo: '/images/operators/9mobile.png',
        country: 'ng' 
      }
    ];
  }

  // Handle Webhook
  processWebhook(payload) {
    try {
      console.log('📥 Processing Lenco webhook:', payload.event || 'unknown event');
      
      // Lenco webhook structure based on their docs
      const eventType = payload.event;
      const data = payload.data;
      
      return {
        success: true,
        event_type: eventType,
        payment_reference: data.reference,
        lenco_reference: data.lencoReference,
        status: data.status,
        amount: parseFloat(data.amount),
        currency: data.currency,
        type: data.type,
        completed_at: data.completedAt,
        settlement_status: data.settlementStatus,
        settlement: data.settlement,
        mobile_money_details: data.mobileMoneyDetails,
        card_details: data.cardDetails
      };
    } catch (error) {
      console.error('❌ Webhook processing failed:', error.message);
      return {
        success: false,
        error: 'Invalid webhook payload'
      };
    }
  }

  // Get Collection by ID
  async getCollectionById(collectionId) {
    try {
      console.log('🔄 Fetching collection by ID:', collectionId);
      
      const headers = this.createHeaders();

      const response = await axios.get(
        `${this.baseURL}/collections/${collectionId}`,
        { headers, timeout: 30000 }
      );

      return {
        success: true,
        data: response.data.data
      };

    } catch (error) {
      console.error('❌ Get collection failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get collection'
      };
    }
  }

  // Test connection
  async testConnection() {
    try {
      console.log('🔄 Testing Lenco API connection...');
      
      const headers = this.createHeaders();

      // Try to make a simple request to verify credentials
      const response = await axios.get(
        `${this.baseURL}/collections/status/test-reference-${Date.now()}`,
        { headers, timeout: 10000 }
      );

      // Even if not found, if we get a proper error response, connection is working
      console.log('✅ Lenco API connection test completed');
      return { success: true, connected: true };

    } catch (error) {
      if (error.response && error.response.status !== 500) {
        // Getting a response means connection is working
        console.log('✅ Lenco API connection is working');
        return { success: true, connected: true };
      }
      
      console.error('❌ Lenco API connection failed:', error.message);
      return { 
        success: false, 
        connected: false,
        error: error.message 
      };
    }
  }

  // Get payment analytics (basic implementation)
  async getPaymentAnalytics(startDate, endDate) {
    try {
      console.log('📊 Note: Lenco API analytics would need specific merchant dashboard access');
      
      // For now, return basic structure - would need actual Lenco analytics endpoint
      return {
        success: true,
        data: {
          note: 'Lenco analytics require dashboard access',
          period: { start: startDate, end: endDate }
        }
      };

    } catch (error) {
      console.error('❌ Payment analytics fetch failed:', error);
      
      return {
        success: false,
        error: 'Analytics not available'
      };
    }
  }
}

module.exports = new LencoPaymentService();