// Popup script for Marketplace Deal Scanner - LIVE SEARCH MODE

// FREEMIUM MODEL CONSTANTS
const FREE_ANALYSIS_LIMIT = 5;

// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const serpApiKeyInput = document.getElementById('serpApiKey');
const saveKeyBtn = document.getElementById('saveKey');
const analyzeBtn = document.getElementById('analyzeBtn');
const ebayCompsBtn = document.getElementById('ebayCompsBtn');
const spinner = document.getElementById('spinner');
const result = document.getElementById('result');
const keyStatus = document.getElementById('keyStatus');
const setupCard = document.getElementById('setupCard');
const settingsIcon = document.getElementById('settingsIcon');

// Freemium modal elements
const freemiumModal = document.getElementById('freemiumModal');
const modalClose = document.getElementById('modalClose');
const createAccountBtn = document.getElementById('createAccountBtn');
const accountEmail = document.getElementById('accountEmail');
const analysisCountDisplay = document.getElementById('analysisCount');

// History elements
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Store identified product name for eBay search
let identifiedProductName = null;

// Helper function to safely inject content script
async function ensureContentScriptInjected(tabId) {
  try {
    // Try to ping the content script
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (response && response.success) {
      console.log('Content script already injected');
      return true;
    }
  } catch (error) {
    // Content script not injected, inject it
    console.log('Injecting content script...');
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    // Wait a bit for injection to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  }
}

// === FREEMIUM MODEL FUNCTIONS ===

// Check if user has analyses remaining
async function checkAnalysisLimit() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['analysisCount', 'hasAccount', 'userEmail'], (data) => {
      const count = data.analysisCount || 0;
      const hasAccount = data.hasAccount || false;

      console.log('=== FREEMIUM CHECK ===');
      console.log('Analysis count:', count);
      console.log('Has account:', hasAccount);
      console.log('User email:', data.userEmail);

      if (hasAccount) {
        // User has account, unlimited access
        resolve({ allowed: true, count, hasAccount: true });
      } else if (count >= FREE_ANALYSIS_LIMIT) {
        // Free limit reached
        resolve({ allowed: false, count, hasAccount: false });
      } else {
        // Within free limit
        resolve({ allowed: true, count, hasAccount: false });
      }
    });
  });
}

// Increment analysis count
async function incrementAnalysisCount() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['analysisCount'], (data) => {
      const newCount = (data.analysisCount || 0) + 1;
      chrome.storage.local.set({ analysisCount: newCount }, () => {
        console.log('Analysis count incremented to:', newCount);
        resolve(newCount);
      });
    });
  });
}

// Show freemium modal
function showFreemiumModal(count) {
  analysisCountDisplay.textContent = count;
  freemiumModal.classList.remove('hidden');
}

// Hide freemium modal
function hideFreemiumModal() {
  freemiumModal.classList.add('hidden');
}

// === HISTORY FUNCTIONS ===

// Save analysis to history
async function saveToHistory(analysis, productName) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['analysisHistory'], (data) => {
      const history = data.analysisHistory || [];

      const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        product: productName || analysis.exactProduct || 'Unknown Product',
        analysis: analysis
      };

      // Add to beginning of array (most recent first)
      history.unshift(historyItem);

      // Limit to 20 most recent analyses
      const trimmedHistory = history.slice(0, 20);

      chrome.storage.local.set({ analysisHistory: trimmedHistory }, () => {
        console.log('Saved to history:', historyItem.product);
        resolve(trimmedHistory);
      });
    });
  });
}

// Load and display history
function loadHistory() {
  chrome.storage.local.get(['analysisHistory'], (data) => {
    const history = data.analysisHistory || [];

    if (history.length === 0) {
      historyList.innerHTML = `
        <p style="color: #6B7280; font-size: 13px; text-align: center; padding: 20px;">
          No analyses yet. Analyze your first product!
        </p>
      `;
      return;
    }

    historyList.innerHTML = history.map(item => {
      const date = new Date(item.timestamp);
      const timeAgo = getTimeAgo(date);
      const verdict = item.analysis.verdict || 'Unknown';
      const verdictClass = (verdict.includes('Home Run') || verdict.includes('Strong Deal')) ? 'success' : 'warning';

      return `
        <div class="history-item" data-id="${item.id}">
          <div class="history-item-header">
            <div class="history-item-title">${item.product}</div>
            <div class="history-item-verdict ${verdictClass}">${verdict}</div>
          </div>
          <div class="history-item-meta">
            <span class="history-item-price">${item.analysis.askingPrice || 'N/A'}</span>
            <span>${timeAgo}</span>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers to history items
    document.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const itemId = parseInt(item.dataset.id);
        const historyItem = history.find(h => h.id === itemId);
        if (historyItem) {
          viewHistoryItem(historyItem);
        }
      });
    });
  });
}

// View a history item
function viewHistoryItem(historyItem) {
  // Switch to Analyze tab
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="analyze"]').classList.add('active');
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById('analyzeTab').classList.add('active');

  // Display the analysis
  displayResults(historyItem.analysis);

  // Scroll to results
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Clear history
function clearHistory() {
  if (confirm('Are you sure you want to clear all analysis history?')) {
    chrome.storage.local.set({ analysisHistory: [] }, () => {
      console.log('History cleared');
      loadHistory();
      showSuccess('History cleared successfully');
    });
  }
}

// Helper function to get "time ago" string
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;

    // Update tab active state
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Show corresponding content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');

    // Load history when History tab is clicked
    if (tabName === 'history') {
      loadHistory();
    }
  });
});

// Clear history button
clearHistoryBtn.addEventListener('click', clearHistory);

// Settings icon toggles setup card
settingsIcon.addEventListener('click', () => {
  setupCard.classList.toggle('hidden');
});

// === FREEMIUM MODAL EVENT LISTENERS ===

// Close modal
modalClose.addEventListener('click', () => {
  hideFreemiumModal();
});

// Close modal when clicking outside
freemiumModal.addEventListener('click', (e) => {
  if (e.target === freemiumModal) {
    hideFreemiumModal();
  }
});

// Create account button
createAccountBtn.addEventListener('click', async () => {
  const email = accountEmail.value.trim();

  if (!email) {
    showError('Please enter your email address');
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showError('Please enter a valid email address');
    return;
  }

  // For MVP: Just store email and grant unlimited access
  // Future: Send to backend API for proper account creation
  chrome.storage.local.set({
    hasAccount: true,
    userEmail: email,
    accountCreatedAt: new Date().toISOString()
  }, () => {
    console.log('Account created for:', email);
    hideFreemiumModal();
    showSuccess('Account created! You now have unlimited analyses.');

    // TODO: In production, send email to backend API
    // await fetch('https://your-api.com/create-account', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email })
    // });
  });
});

// Expandable sections
document.querySelectorAll('.expandable').forEach(section => {
  const header = section.querySelector('.expandable-header');
  header.addEventListener('click', () => {
    section.classList.toggle('open');
  });
});

// eBay Sold Comps button - Arbitrage Strategy
ebayCompsBtn.addEventListener('click', async () => {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error('No active tab found');
    }

    // Ensure content script is injected
    await ensureContentScriptInjected(tab.id);

    // Scrape the listing to get the title
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });

    if (!response.success) {
      throw new Error(response.error || 'Failed to scrape listing');
    }

    // Use AI-identified product name if available, otherwise use scraped title
    const productName = identifiedProductName || response.data.title || 'unknown item';

    console.log('=== eBay Sold Comps Search ===');
    console.log('Using:', identifiedProductName ? 'AI-identified product name' : 'Scraped title');
    console.log('Product name:', productName);

    // Clean the title for eBay search
    const cleanTitle = cleanTitleForEbay(productName);

    // Build eBay sold listings URL
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(cleanTitle)}&_sacat=0&LH_Sold=1&LH_Complete=1&_sop=15`;

    console.log('Opening eBay URL:', ebayUrl);
    console.log('===============================');

    // Open in new tab
    chrome.tabs.create({ url: ebayUrl });

  } catch (error) {
    console.error('Error opening eBay comps:', error);
    showError(error.message || 'Failed to open eBay sold comps');
  }
});

// Function to clean title for eBay search
function cleanTitleForEbay(title) {
  let cleaned = title;

  // Remove emojis
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols
  cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, ''); // Misc symbols
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, ''); // Dingbats

  // Remove spam words
  const spamWords = [
    'L@@K', 'LOOK', 'WOW', 'RARE', 'CHEAP', 'MUST SEE', 'NR', 'NO RESERVE',
    'FREE SHIPPING', 'BRAND NEW', 'MINT', 'HTF', 'VHTF', 'HOLY GRAIL'
  ];

  spamWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });

  // Remove extra symbols and clean up
  cleaned = cleaned.replace(/[!@#$%^&*()_+=\[\]{};':"\\|,.<>?]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' '); // Remove multiple spaces
  cleaned = cleaned.trim();

  console.log('Cleaned title for eBay:', cleaned);
  return cleaned;
}

// Load saved API keys and last analysis on popup open
chrome.storage.local.get(['openai_key', 'serp_key', 'lastAnalysis', 'identifiedProduct'], (data) => {
  if (data.openai_key) {
    apiKeyInput.value = data.openai_key;
  }

  if (data.serp_key) {
    serpApiKeyInput.value = data.serp_key;
  }

  // Update status and show/hide setup card
  if (data.openai_key && data.serp_key) {
    keyStatus.textContent = 'OpenAI + SerpApi keys saved (Live Search Enabled)';
    keyStatus.classList.add('has-key');
    setupCard.classList.add('hidden');
  } else if (data.openai_key) {
    keyStatus.textContent = 'OpenAI key saved (Add SerpApi for Live Search)';
    keyStatus.classList.add('has-key');
    setupCard.classList.add('hidden');
  } else {
    setupCard.classList.remove('hidden');
  }

  // Restore last analysis if exists
  if (data.lastAnalysis) {
    displayResults(data.lastAnalysis);
  }

  // Restore identified product name for eBay button
  if (data.identifiedProduct) {
    identifiedProductName = data.identifiedProduct;
    if (ebayCompsBtn) {
      ebayCompsBtn.innerHTML = `<span>Check eBay Sold Comps (AI: ${data.identifiedProduct.substring(0, 30)}${data.identifiedProduct.length > 30 ? '...' : ''})</span>`;
    }
  }
});

// Save API keys - BOTH openai_key and serp_key
saveKeyBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const serpApiKey = serpApiKeyInput.value.trim();

  if (!apiKey) {
    showError('Please enter an OpenAI API key');
    return;
  }

  if (!apiKey.startsWith('sk-')) {
    showError('Invalid OpenAI API key format. Should start with "sk-"');
    return;
  }

  const keysToSave = {
    openai_key: apiKey
  };

  if (serpApiKey) {
    keysToSave.serp_key = serpApiKey;
  }

  chrome.storage.local.set(keysToSave, () => {
    if (serpApiKey) {
      showSuccess('OpenAI + SerpApi keys saved! Live Search enabled.');
      keyStatus.textContent = 'OpenAI + SerpApi keys saved (Live Search Enabled)';
    } else {
      showSuccess('OpenAI key saved! (Add SerpApi for Live Search)');
      keyStatus.textContent = 'OpenAI key saved (Add SerpApi for Live Search)';
    }
    keyStatus.classList.add('has-key');
    setupCard.classList.add('hidden');
  });
});

// MAIN ANALYSIS FLOW - LIVE SEARCH MODE
analyzeBtn.addEventListener('click', async () => {
  // === FREEMIUM CHECK ===
  const limitCheck = await checkAnalysisLimit();

  if (!limitCheck.allowed) {
    // Show freemium modal
    console.log('Free limit reached, showing modal');
    showFreemiumModal(limitCheck.count);
    return;
  }

  // Get API keys from storage
  const { openai_key, serp_key } = await chrome.storage.local.get(['openai_key', 'serp_key']);

  if (!openai_key) {
    showError('Please enter your OpenAI API key first');
    return;
  }

  // Hide previous results and errors
  result.classList.remove('active');
  document.querySelectorAll('.error, .success').forEach(el => el.remove());

  // Show spinner
  spinner.classList.add('active');
  analyzeBtn.disabled = true;

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error('No active tab found');
    }

    // Ensure content script is injected
    await ensureContentScriptInjected(tab.id);

    // Send scrape message
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });

    if (!response.success) {
      throw new Error(response.error || 'Failed to scrape listing');
    }

    const listingData = response.data;

    // Log scraped data for debugging
    console.log('=== SCRAPED DATA DEBUG ===');
    console.log('Title:', listingData.title);
    console.log('Price:', listingData.price);
    console.log('Description length:', listingData.description?.length || 0);
    console.log('Image count:', listingData.images?.length || 0);

    // DEBUG: Verify images are base64 data URLs
    if (listingData.images && listingData.images.length > 0) {
      console.log('First image preview (first 100 chars):', listingData.images[0].substring(0, 100));
      console.log('First image starts with data:image?', listingData.images[0].startsWith('data:image'));
      console.log('Total payload size (KB):', JSON.stringify(listingData.images).length / 1024);
    } else {
      console.error('❌ CRITICAL: No images in listingData! Images were not scraped or converted.');
    }
    console.log('========================');

    // Validate scraped data
    if (!listingData.title && !listingData.description && !listingData.price) {
      throw new Error('Could not extract listing information. Make sure you\'re on a marketplace listing page.');
    }

    // === STEP 1: IDENTIFY PRODUCT ===
    let productIdentification = null;
    try {
      console.log('STEP 1: Identifying product...');
      productIdentification = await identifyProduct(openai_key, listingData);
      console.log('Product identified:', productIdentification);

      // Store for eBay comps button (Pro feature)
      identifiedProductName = productIdentification;

      // Update eBay button to show it's using AI-identified name
      if (ebayCompsBtn) {
        ebayCompsBtn.innerHTML = `<span>Check eBay Sold Comps (AI: ${productIdentification.substring(0, 30)}${productIdentification.length > 30 ? '...' : ''})</span>`;
      }
    } catch (error) {
      console.error('Product identification failed:', error);
      // Fallback to listing title
      productIdentification = listingData.title || 'Unknown Product';
      showError('Product identification failed. Using listing title as fallback.');
    }

    // === STEP 2: LIVE SEARCH (if SerpApi key available) ===
    let livePrices = null;
    let newRetailData = null;
    if (serp_key) {
      try {
        console.log('STEP 2A: Searching for NEW retail prices...');
        newRetailData = await searchNewRetail(serp_key, productIdentification);
        console.log('New retail data found:', newRetailData);
      } catch (error) {
        console.error('New retail search failed:', error);
        // Continue without retail data
      }

      try {
        console.log('STEP 2B: Searching for USED market prices...');
        livePrices = await searchGoogleShopping(serp_key, productIdentification);
        console.log('Used prices found:', livePrices);
      } catch (error) {
        console.error('Used price search failed:', error);
        // Continue without live prices
      }
    } else {
      console.log('STEP 2: Skipped (no SerpApi key)');
    }

    // === STEP 3: FINAL ANALYSIS ===
    console.log('STEP 3: Generating final analysis...');
    const analysis = await generateFinalAnalysis(openai_key, listingData, productIdentification, livePrices, newRetailData);

    // === INCREMENT ANALYSIS COUNT (only if not premium) ===
    if (!limitCheck.hasAccount) {
      const newCount = await incrementAnalysisCount();
      console.log(`Analysis complete. Count: ${newCount}/${FREE_ANALYSIS_LIMIT}`);
    }

    // Save analysis and identified product to storage
    chrome.storage.local.set({
      lastAnalysis: analysis,
      identifiedProduct: productIdentification
    });

    // Save to history
    await saveToHistory(analysis, productIdentification);

    // Display results
    displayResults(analysis);

  } catch (error) {
    console.error('Error:', error);
    showError(error.message || 'An error occurred while analyzing the listing');
  } finally {
    spinner.classList.remove('active');
    analyzeBtn.disabled = false;
  }
});

// === STEP 1: IDENTIFY PRODUCT ===
async function identifyProduct(apiKey, listingData) {
  const systemPrompt = `You are a product identification expert. Your job is to extract the EXACT product name from listing data.

CRITICAL INSTRUCTIONS:
1. ANALYZE THE TEXT FIRST (title + description) - this is the PRIMARY source
2. Extract the complete product name including:
   - Brand name (e.g., "North Face", "IKEA", "Herman Miller")
   - Model name (e.g., "Antora", "Mörbylånga", "Aeron")
   - Important variants (e.g., "Men's", "Women's", specific color, size if part of the model name)
3. DO NOT add generic descriptions like "Jacket" or "Chair" unless they're part of the official product name
4. If images are provided, use them to VERIFY the text-based identification (not as primary source)

OUTPUT FORMAT: Brand + Model + Variant (if applicable)

Examples:
- Good: "North Face Men's Antora Waterproof Jacket"
- Good: "Herman Miller Aeron Chair"
- Good: "IKEA Mörbylånga Table"
- Bad: "North Face Jacket" (too vague)
- Bad: "Blue chair" (no brand/model)`;

  // Build comprehensive user message - TEXT FIRST
  let userMessage = `LISTING INFORMATION (analyze this first):\n\n`;
  userMessage += `Title: ${listingData.title || 'Not provided'}\n\n`;
  userMessage += `Description: ${listingData.description || 'Not provided'}\n\n`;
  userMessage += `Task: Extract the exact brand and model name from the text above. Include all relevant details (Men's/Women's, specific model variants, etc.).`;

  const userContent = [
    {
      type: 'text',
      text: userMessage
    }
  ];

  // Add images for VERIFICATION (up to 3 images)
  if (listingData.images && listingData.images.length > 0) {
    const imagesToAnalyze = listingData.images.slice(0, 3);
    console.log(`Adding ${imagesToAnalyze.length} images for product verification`);

    imagesToAnalyze.forEach((imageUrl) => {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: imageUrl,
          detail: 'low' // Low detail is fine for verification
        }
      });
    });

    // Add verification instruction
    userContent.push({
      type: 'text',
      text: '\n\nImages provided above. Use them to verify/confirm the product identification from the text, but prioritize the text description.'
    });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.2, // Lower temperature for more precise extraction
      max_tokens: 150
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const brandAndModel = data.choices[0].message.content.trim();

  console.log('=== PRODUCT IDENTIFICATION ===');
  console.log('Input Title:', listingData.title);
  console.log('Input Description (first 200 chars):', (listingData.description || '').substring(0, 200));
  console.log('Identified Product:', brandAndModel);
  console.log('===============================');

  return brandAndModel;
}

// === STEP 2A: NEW RETAIL SEARCH ===
async function searchNewRetail(serpKey, productName) {
  const searchQuery = `${productName} new`;
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(searchQuery)}&api_key=${serpKey}&num=20`;

  console.log(`Searching NEW retail: ${searchQuery}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`SerpApi error: ${response.status}`);
    }

    const data = await response.json();

    console.log('SerpAPI full response:', data);

    // Filter for actual NEW retail products (not marketplace/used)
    if (data.shopping_results && data.shopping_results.length > 0) {
      // Filter out marketplace sellers (Facebook, eBay, etc.)
      const retailResults = data.shopping_results.filter(result => {
        const source = (result.source || '').toLowerCase();
        const title = (result.title || '').toLowerCase();

        // Exclude marketplace and used listings
        return !source.includes('facebook') &&
               !source.includes('ebay') &&
               !source.includes('craigslist') &&
               !source.includes('offerup') &&
               !source.includes('mercari') &&
               !title.includes('used') &&
               !title.includes('pre-owned') &&
               !title.includes('refurbished');
      });

      console.log(`Filtered to ${retailResults.length} retail results from ${data.shopping_results.length} total`);

      if (retailResults.length > 0) {
        const firstResult = retailResults[0];
        console.log('Selected retail result:', firstResult);

        // Get the actual product link (not Google redirect)
        let productLink = '#';
        if (firstResult.product_link && !firstResult.product_link.includes('google.com')) {
          productLink = firstResult.product_link;
        } else if (firstResult.link && !firstResult.link.includes('google.com')) {
          productLink = firstResult.link;
        }

        console.log('Product link:', productLink);

        return {
          price: firstResult.price || firstResult.extracted_price || 'N/A',
          link: productLink,
          title: firstResult.title,
          source: firstResult.source
        };
      }
    }

    return null;

  } catch (error) {
    console.error('New retail search failed:', error);
    return null;
  }
}

// === STEP 2B: USED MARKET SEARCH ===
async function searchGoogleShopping(serpKey, productName) {
  const searchQuery = `${productName} used`;
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(searchQuery)}&api_key=${serpKey}`;

  console.log(`Searching USED market: ${searchQuery}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`SerpApi error: ${response.status}`);
    }

    const data = await response.json();

    // Extract prices from shopping results
    const prices = [];

    if (data.shopping_results && data.shopping_results.length > 0) {
      data.shopping_results.forEach(result => {
        if (result.price) {
          prices.push({
            price: result.price,
            title: result.title,
            source: result.source
          });
        }
      });
    }

    return {
      query: searchQuery,
      prices: prices,
      count: prices.length
    };

  } catch (error) {
    console.error('SerpApi search failed:', error);
    return null; // Gracefully fallback if search fails
  }
}

// === STEP 3: FINAL ANALYSIS ===
async function generateFinalAnalysis(apiKey, listingData, productName, livePrices, newRetailData) {
  // Marketplace Deal Analyzer - Based on proven methodology
  const systemPrompt = `You are my real-time Facebook Marketplace deal analyzer with expert knowledge of secondary markets.

TONE: Casual but professional. Be direct and honest.

ANALYSIS METHODOLOGY:

1. IDENTIFY THE ITEM
- Recognize exact product, model, brand, version/generation
- Make educated guesses from visual cues if unclear

2. ESTABLISH REAL-WORLD VALUE
Use this repeatable process:
a) Retail price (new) - typical MSRP
b) Used-market average - based on ${livePrices ? 'LIVE market data provided' : 'eBay sold listings, OfferUp, FB Marketplace comps'}
c) Condition adjustments - missing parts, cosmetic wear, upgrades, packaging
d) Category depreciation baselines:
   - Tools: 50-70% of retail
   - Apparel: 30-50% of retail
   - Premium brands (Arc'teryx, Patagonia, North Face): 60-80% of retail
   - Electronics: 40-70% of retail
   - Furniture (IKEA): 20-40% of retail
   - Furniture (premium brands): 40-60% of retail

3. PRICE RATING TIERS
- Home Run Deal: 50%+ below average used value OR can flip for 2x profit
- Strong Deal: 30-40% below used market value
- Fair Deal: Within 10-20% of typical used market
- Overpriced: Above average used value or condition doesn't justify price

4. NEGOTIATION STRATEGY
Provide three price points:
- Ideal offer (lowball but reasonable)
- Realistic accepted offer (likely to close deal)
- Max to pay (walk-away price)

NEGOTIATION MESSAGE RULES:
- If verdict is "Home Run" → Express interest WITHOUT asking for lower price (it's already a great deal)
- If verdict is "Strong Deal" or "Fair Deal" → Suggest a lower offer price
- If verdict is "Overpriced" → Suggest a much lower price or point out issues
- Keep message casual, 1 sentence, no greetings

5. IMAGES ANALYSIS
Carefully inspect all product images for:
- Scratches, dents, chips, cracks, wear patterns, fading
- Missing parts, broken components, dirt, stains
- Overall condition vs seller's description

Return ONLY a JSON object:
{
  "verdict": "Home Run, Strong Deal, Fair Deal, or Overpriced",
  "exactProduct": "Brand + Model + Version",
  "askingPrice": "exact asking price",
  "newRetailPrice": "${newRetailData ? newRetailData.price : 'typical new retail'}",
  "newRetailLink": "${newRetailData ? newRetailData.link : ''}",
  "usedMarketAverage": "typical used market price",
  "idealOffer": "your lowball offer",
  "realisticOffer": "likely accepted offer",
  "estimatedProfit": "flip profit after 10-15% fees",
  "pros": "Why it's a deal (1 sentence)",
  "cons": "SPECIFIC defects from images or risks (1 sentence)",
  "finalVerdict": "Buy, Negotiate, Skip, or Flip",
  "message": "casual negotiation message - if Home Run, express interest without lowballing; otherwise suggest lower offer"
}

CRITICAL RULES:
- Be honest if the deal isn't good
- Account for actual condition from images
- Use category-specific depreciation rules
- Flip profit = (resale price - purchase price - 12.5% fees)
${newRetailData ? `- newRetailPrice MUST be exactly "${newRetailData.price}"` : ''}
${newRetailData ? `- newRetailLink MUST be exactly "${newRetailData.link}"` : ''}
${livePrices ? '- PRIORITIZE live market data provided - these are REAL current prices' : ''}`;

  // Build user message - ultra concise
  let userMessage = `Title: ${listingData.title || 'N/A'}\nPrice: ${listingData.price || 'N/A'}\nDescription: ${listingData.description || 'N/A'}\n\nProduct: ${productName}`;

  // Add new retail price if available
  if (newRetailData) {
    console.log('=== NEW RETAIL DATA ===');
    console.log('Price:', newRetailData.price);
    console.log('Title:', newRetailData.title);
    console.log('Source:', newRetailData.source);
    console.log('Link:', newRetailData.link);
    console.log('=======================');

    userMessage += `\n\nNEW RETAIL PRICE (verified live search):\n${newRetailData.price} - ${newRetailData.title} (${newRetailData.source})\nLink: ${newRetailData.link}`;
  } else {
    console.warn('WARNING: No new retail data found! AI will estimate the price.');
  }

  // Add used market prices if available
  if (livePrices && livePrices.prices.length > 0) {
    userMessage += `\n\nUSED MARKET PRICES (today):\n`;
    livePrices.prices.slice(0, 10).forEach((item, index) => {
      userMessage += `${index + 1}. ${item.title} - ${item.price}\n`;
    });
  }

  // Emphasize image analysis
  const imageCount = listingData.images?.length || 0;
  if (imageCount > 0) {
    userMessage += `\n\nANALYZE THE ${imageCount} PRODUCT IMAGES BELOW:\nLook for scratches, wear, damage, condition issues. Report SPECIFIC defects you see.`;
  } else {
    userMessage += `\n\nNO IMAGES PROVIDED - assess based on description only.`;
  }

  const userContent = [
    {
      type: 'text',
      text: userMessage
    }
  ];

  // Add all images with high detail for better condition assessment
  if (listingData.images && listingData.images.length > 0) {
    const imagesToAnalyze = listingData.images.slice(0, 6);
    console.log(`=== IMAGE ANALYSIS DEBUG ===`);
    console.log(`Preparing to send ${imagesToAnalyze.length} images for DETAILED analysis`);

    // DEBUG: Log each image details
    imagesToAnalyze.forEach((imageUrl, index) => {
      console.log(`Image ${index + 1}:`, {
        preview: imageUrl.substring(0, 50) + '...',
        isBase64: imageUrl.startsWith('data:image'),
        length: imageUrl.length,
        detail: index < 4 ? 'high' : 'low'
      });

      userContent.push({
        type: 'image_url',
        image_url: {
          url: imageUrl,
          detail: index < 4 ? 'high' : 'low' // Use high detail for first 4 images
        }
      });
    });

    console.log('Total userContent items (text + images):', userContent.length);
    console.log('API request payload size (KB):', JSON.stringify(userContent).length / 1024);
    console.log('============================');
  } else {
    console.error('❌ CRITICAL ERROR: No images found in listing data!');
    console.error('This means images were not scraped from the page or base64 conversion failed.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.4, // Lower temp for more factual image analysis
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your OpenAI API key.');
    } else if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after') || '60';
      throw new Error(`Rate limit exceeded. Wait ${retryAfter} seconds or upgrade at platform.openai.com/account/limits`);
    } else {
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  console.log('=== API RESPONSE DEBUG ===');
  console.log('Full AI response:', content);
  console.log('Response length:', content.length);
  console.log('========================');

  // Parse JSON response
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('=== PARSED ANALYSIS ===');
      console.log('Verdict:', parsed.verdict);
      console.log('Pros:', parsed.pros);
      console.log('Cons:', parsed.cons);
      console.log('=====================');
      return parsed;
    }
    throw new Error('No JSON found in response');
  } catch (e) {
    console.error('Failed to parse JSON:', content);
    throw new Error('Failed to parse analysis results');
  }
}

// Display results with verdict badge and clean format
function displayResults(data) {
  const verdict = data.verdict || 'Unknown';
  const negotiationMessage = data.message || '';

  // Determine verdict badge color
  let verdictClass = 'verdict-badge';
  if (verdict.includes('Home Run') || verdict.includes('Strong Deal')) {
    verdictClass += ' success'; // Green
  } else if (verdict.includes('Overpriced')) {
    verdictClass += ' warning'; // Red
  }

  // Build results list HTML
  const resultsList = document.getElementById('resultsList');
  resultsList.innerHTML = `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">
          Verdict
          <span class="tooltip-trigger">?
            <span class="tooltip-text">Deal rating: Home Run (50%+ off), Strong Deal (30-40% off), Fair Deal (10-20% off), or Overpriced</span>
          </span>
        </div>
      </div>
      <div class="result-value ${verdictClass}">
        ${verdict}
      </div>
    </div>

    ${data.exactProduct ? `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">Product</div>
      </div>
      <div class="result-value">${data.exactProduct}</div>
    </div>
    ` : ''}

    ${data.askingPrice ? `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">Asking Price</div>
      </div>
      <div class="result-value">${data.askingPrice}</div>
    </div>
    ` : ''}

    ${data.newRetailPrice && data.newRetailPrice !== 'N/A' ? `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">
          Retail New Price:
          <span class="tooltip-trigger">?
            <span class="tooltip-text">What this product costs brand new from retail stores</span>
          </span>
        </div>
      </div>
      <div class="result-value">
        ${data.newRetailPrice}
        ${data.newRetailLink && data.newRetailLink !== '' && data.newRetailLink !== '#' ? `<a href="${data.newRetailLink}" target="_blank" rel="noopener noreferrer" class="retail-link">View</a>` : ''}
      </div>
    </div>
    ` : ''}

    ${data.usedMarketAverage ? `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">
          Used Market Average:
          <span class="tooltip-trigger">?
            <span class="tooltip-text">Typical used market price based on recent sold comps</span>
          </span>
        </div>
      </div>
      <div class="result-value">${data.usedMarketAverage}</div>
    </div>
    ` : ''}

    ${data.idealOffer ? `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">
          Ideal Offer:
          <span class="tooltip-trigger">?
            <span class="tooltip-text">Your lowball offer (reasonable but aggressive)</span>
          </span>
        </div>
      </div>
      <div class="result-value success">${data.idealOffer}</div>
    </div>
    ` : ''}

    ${data.realisticOffer ? `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">
          Realistic Offer:
          <span class="tooltip-trigger">?
            <span class="tooltip-text">Likely to be accepted and close the deal</span>
          </span>
        </div>
      </div>
      <div class="result-value">${data.realisticOffer}</div>
    </div>
    ` : ''}

    ${data.estimatedProfit ? `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">
          Est. Flip Profit:
          <span class="tooltip-trigger">?
            <span class="tooltip-text">Estimated profit after 12.5% marketplace fees</span>
          </span>
        </div>
      </div>
      <div class="result-value highlight">${data.estimatedProfit}</div>
    </div>
    ` : ''}

    ${data.finalVerdict ? `
    <div class="result-row">
      <div class="result-left">
        <div class="result-label">
          Action:
          <span class="tooltip-trigger">?
            <span class="tooltip-text">Clear recommendation: Buy, Negotiate, Skip, or Flip</span>
          </span>
        </div>
      </div>
      <div class="result-value" style="font-weight: 700; text-transform: uppercase;">${data.finalVerdict}</div>
    </div>
    ` : ''}
  `;

  // Fill expandable sections with pros/cons
  const imageInsights = document.getElementById('imageInsights');
  if (imageInsights) {
    let breakdown = '';
    if (data.pros) {
      breakdown += `✓ PROS: ${data.pros}\n\n`;
    }
    if (data.cons) {
      breakdown += `✗ CONS: ${data.cons}\n\n`;
    }
    if (data.finalVerdict) {
      breakdown += `\nRECOMMENDATION: ${data.finalVerdict.toUpperCase()}`;
    }
    imageInsights.textContent = breakdown || 'No analysis available';
  }

  // Hide unused sections
  const marketResearchSection = document.getElementById('marketResearchSection');
  if (marketResearchSection) {
    marketResearchSection.style.display = 'none';
  }

  const contextSection = document.getElementById('contextSection');
  if (contextSection) {
    contextSection.style.display = 'none';
  }

  // Update message box
  const msgBox = document.getElementById('msgBox');
  if (msgBox && negotiationMessage) {
    msgBox.textContent = negotiationMessage;
  }

  // Show results
  result.classList.add('active');

  // Add copy button functionality
  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn && msgBox) {
    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

    newCopyBtn.addEventListener('click', () => {
      const messageText = msgBox.textContent;
      navigator.clipboard.writeText(messageText).then(() => {
        const originalText = newCopyBtn.textContent;
        newCopyBtn.textContent = 'Copied!';
        setTimeout(() => {
          newCopyBtn.textContent = originalText;
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    });
  }

  // Scroll to results
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Show error message
function showError(message) {
  // Remove existing messages
  document.querySelectorAll('.error, .success').forEach(el => el.remove());

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';
  errorDiv.textContent = message;

  const card = document.querySelector('.card');
  card.appendChild(errorDiv);

  // Auto-remove after 5 seconds
  setTimeout(() => errorDiv.remove(), 5000);
}

// Show success message
function showSuccess(message) {
  // Remove existing messages
  document.querySelectorAll('.error, .success').forEach(el => el.remove());

  const successDiv = document.createElement('div');
  successDiv.className = 'success';
  successDiv.textContent = message;

  const card = document.querySelector('.card');
  card.appendChild(successDiv);

  // Auto-remove after 3 seconds
  setTimeout(() => successDiv.remove(), 3000);
}
