// Content script for scraping marketplace listings
// Runs on Facebook Marketplace, Craigslist, and OfferUp

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape') {
    // Use async function to handle image conversion
    (async () => {
      try {
        const data = await scrapeListing();
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for async response
  }
});

// Helper function to convert image to base64
async function imageToBase64(imgElement) {
  return new Promise((resolve) => {
    try {
      // Check if image has valid dimensions
      if (!imgElement.naturalWidth || !imgElement.naturalHeight) {
        console.warn('Image has no dimensions, skipping:', imgElement.src.substring(0, 100));
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Limit max size to reduce payload
      const maxSize = 800;
      let width = imgElement.naturalWidth;
      let height = imgElement.naturalHeight;

      const originalWidth = width;
      const originalHeight = height;

      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        console.log(`Resizing image from ${originalWidth}x${originalHeight} to ${width}x${height}`);
      }

      canvas.width = width;
      canvas.height = height;

      // Draw image to canvas
      ctx.drawImage(imgElement, 0, 0, width, height);

      // Convert to base64
      const dataURL = canvas.toDataURL('image/jpeg', 0.7);

      // Verify the result is valid
      if (!dataURL || !dataURL.startsWith('data:image')) {
        console.error('Invalid base64 data URL generated');
        resolve(null);
        return;
      }

      console.log(`Base64 conversion successful: ${dataURL.length} characters`);
      resolve(dataURL);
    } catch (error) {
      console.error('Failed to convert image:', error.message, error.stack);
      resolve(null);
    }
  });
}

async function scrapeListing() {
  const hostname = window.location.hostname;
  let data = {
    title: '',
    price: '',
    description: '',
    images: [],
    url: window.location.href
  };

  if (hostname.includes('facebook.com')) {
    data = await scrapeFacebook();
  } else if (hostname.includes('craigslist.org')) {
    data = await scrapeCraigslist();
  } else if (hostname.includes('offerup.com')) {
    data = await scrapeOfferUp();
  } else {
    // Generic fallback
    data = await scrapeGeneric();
  }

  return data;
}

async function scrapeFacebook() {
  const data = {
    title: '',
    price: '',
    description: '',
    images: [],
    url: window.location.href
  };

  // Get all text content from the page
  const pageText = document.body.innerText;

  // Find title - try multiple strategies

  // Common Facebook UI text to exclude
  const excludePatterns = [
    'Facebook',
    'Marketplace',
    'notification',
    'Notifications',
    'Details',
    'Notification Details',
    'settings',
    'New notification',
    'Message seller',
    'Send message',
    'Share',
    'Save',
    'More',
    'Menu',
    'Home',
    'Watch',
    'Groups',
    'Gaming',
    'Your account',
    'Log out',
    'Switch accounts',
    'See all',
    'View more',
    'Show more'
  ];

  const isExcluded = (text) => {
    const lower = text.toLowerCase();
    return excludePatterns.some(pattern => lower.includes(pattern.toLowerCase())) ||
           text.startsWith('$') ||
           text.includes('In stock') ||
           text.includes('Listed in') ||
           text.match(/^\d+\s*(mi|km|miles|kilometers)$/i) || // Distance like "2 mi"
           text.match(/^\d+\s*hours?\s*ago$/i); // Time like "2 hours ago"
  };

  // Strategy 0: Try meta tags (most reliable for Facebook)
  const metaTitle = document.querySelector('meta[property="og:title"]');
  if (metaTitle) {
    const title = metaTitle.getAttribute('content');
    if (title && title.length >= 3 && title.length <= 200 && !isExcluded(title)) {
      data.title = title;
      console.log('Found title via Strategy 0 (meta tag):', title);
    }
  }

  // Strategy 1: Look for h1 elements (skip if not found via meta tag)
  if (!data.title) {
    const h1Elements = document.querySelectorAll('h1');
    for (const h1 of h1Elements) {
      const text = h1.textContent.trim();
      // Title should be between 3 and 200 characters
      if (text.length >= 3 && text.length <= 200 && !isExcluded(text)) {
        data.title = text;
        console.log('Found title via Strategy 1 (h1):', text);
        break;
      }
    }
  }

  // Strategy 2: Look for large span elements (product titles are usually prominent)
  if (!data.title) {
    const spans = document.querySelectorAll('span');
    const titleSpans = Array.from(spans).filter(span => {
      const text = span.textContent.trim();
      const fontSize = window.getComputedStyle(span).fontSize;
      const fontSizePx = parseInt(fontSize);

      // Look for larger text (likely title), at least 20px font
      return fontSizePx >= 20 &&
             text.length >= 3 &&
             text.length <= 200 &&
             !isExcluded(text);
    });

    if (titleSpans.length > 0) {
      // Sort by font size to get the most prominent
      titleSpans.sort((a, b) => {
        const sizeA = parseInt(window.getComputedStyle(a).fontSize);
        const sizeB = parseInt(window.getComputedStyle(b).fontSize);
        return sizeB - sizeA;
      });
      data.title = titleSpans[0].textContent.trim();
      console.log('Found title via Strategy 2 (large span):', data.title);
    }
  }

  // Strategy 3: Look for the first substantial text in the page
  if (!data.title) {
    const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      if (line.length >= 3 && line.length <= 200 && !isExcluded(line)) {
        data.title = line;
        console.log('Found title via Strategy 3 (page text):', line);
        break;
      }
    }
  }

  // Find price - try multiple strategies

  // Strategy 1: Look for Facebook Marketplace specific patterns (meta tags, structured data)
  const metaPrice = document.querySelector('meta[property="product:price:amount"]');
  if (metaPrice) {
    const amount = metaPrice.getAttribute('content');
    if (amount && parseFloat(amount) > 0) {
      data.price = `$${amount}`;
      console.log('Found price via Strategy 1 (meta tag):', data.price);
    }
  }

  // Strategy 2: Look for large, prominent price spans (likely the listing price)
  if (!data.price) {
    const spans = Array.from(document.querySelectorAll('span'));
    const priceSpans = spans.filter(span => {
      const text = span.textContent.trim();
      const fontSize = window.getComputedStyle(span).fontSize;
      const fontSizePx = parseInt(fontSize);

      // Look for price pattern with larger font size (listing price is usually prominent)
      // Must be at least $1 and have large font
      if (!text.match(/^\$[\d,]+(?:\.\d{2})?$/)) return false;

      const priceValue = parseFloat(text.replace(/[$,]/g, ''));
      return priceValue >= 1 && fontSizePx >= 20; // Increased to 20px for main listing price
    });

    if (priceSpans.length > 0) {
      // Sort by font size descending to get the most prominent price
      priceSpans.sort((a, b) => {
        const sizeA = parseInt(window.getComputedStyle(a).fontSize);
        const sizeB = parseInt(window.getComputedStyle(b).fontSize);
        return sizeB - sizeA;
      });

      const topPrice = priceSpans[0].textContent.trim();
      console.log('Found price via Strategy 2 (large span):', topPrice, 'Font size:', parseInt(window.getComputedStyle(priceSpans[0]).fontSize));
      console.log('Other price candidates:', priceSpans.slice(1, 5).map(s => `${s.textContent.trim()} (${parseInt(window.getComputedStyle(s).fontSize)}px)`));

      data.price = topPrice;
    }
  }

  // Strategy 3: Look in the title text (Facebook often puts price in title area)
  if (!data.price && data.title) {
    const titleAreaText = pageText.substring(0, 1000); // First 1000 chars
    const priceMatches = titleAreaText.match(/\$[\d,]+(?:\.\d{2})?/g);

    if (priceMatches && priceMatches.length > 0) {
      // Get the largest price from the top of the page
      const prices = priceMatches.map(p => ({
        text: p,
        value: parseFloat(p.replace(/[$,]/g, ''))
      })).filter(p => p.value >= 1); // At least $1

      if (prices.length > 0) {
        prices.sort((a, b) => b.value - a.value); // Sort by value descending
        data.price = prices[0].text;
        console.log('Found price via Strategy 3 (title area):', data.price);
        console.log('Title area price candidates:', prices.slice(0, 3).map(p => p.text));
      }
    }
  }

  // Strategy 4: Try any span with exact price format (last resort)
  if (!data.price) {
    const spans = Array.from(document.querySelectorAll('span'));
    const allPrices = [];

    for (const span of spans) {
      const text = span.textContent.trim();
      if (text.match(/^\$[\d,]+(?:\.\d{2})?$/)) {
        const priceValue = parseFloat(text.replace(/[$,]/g, ''));
        if (priceValue >= 1) { // At least $1
          allPrices.push({
            text: text,
            value: priceValue,
            fontSize: parseInt(window.getComputedStyle(span).fontSize)
          });
        }
      }
    }

    if (allPrices.length > 0) {
      // Sort by font size first, then by value
      allPrices.sort((a, b) => {
        if (Math.abs(a.fontSize - b.fontSize) > 2) {
          return b.fontSize - a.fontSize; // Bigger font wins
        }
        return b.value - a.value; // Higher value wins if similar font size
      });

      data.price = allPrices[0].text;
      console.log('Found price via Strategy 4 (any span):', data.price);
      console.log('All price candidates:', allPrices.slice(0, 5).map(p => `${p.text} (${p.fontSize}px)`));
    }
  }

  // Get description - extract all relevant text from the listing
  const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const descriptionParts = [];

  // Priority keywords that indicate product details
  const priorityKeywords = [
    'condition', 'details', 'size', 'color', 'model', 'brand',
    'msrp', 'retail', 'new', 'used', 'original', 'box',
    'features', 'upgrades', 'specifications', 'includes',
    'men', 'women', 'mens', 'womens', "men's", "women's"
  ];

  for (const line of lines) {
    // Skip title, price, and UI elements
    if (line === data.title || line === data.price) continue;

    // Skip common UI text
    if (line.includes('Facebook') ||
        line.includes('Marketplace') ||
        line.includes('Message seller') ||
        line.includes('Send seller') ||
        line.includes('Share') ||
        line.includes('Save') ||
        line.includes('New notification') ||
        line.includes('Joined Facebook') ||
        line.includes('Hi, is this available') ||
        line.startsWith('Listed in') ||
        line.startsWith('Listed a') ||
        line.includes('Location is approximate') ||
        line.includes('Seller information') ||
        line.includes('Highly rated') ||
        line.match(/^\d+\s*(mi|km|miles)$/i) || // Skip distance
        line.match(/^\(\d+\)$/)) { // Skip rating numbers like "(15)"
      continue;
    }

    // Collect relevant lines (product details)
    if (line.length >= 3 && line.length <= 1000) {
      const lower = line.toLowerCase();

      // High priority: Contains product-related keywords
      if (priorityKeywords.some(keyword => lower.includes(keyword))) {
        descriptionParts.push(line);
      }
      // Medium priority: Descriptive sentences
      else if (line.length >= 20 && (line.includes('.') || line.includes(',') || line.includes(':'))) {
        descriptionParts.push(line);
      }
      // Include lines with bullets or lists
      else if (line.includes('•') || line.includes('–') || line.startsWith('-')) {
        descriptionParts.push(line);
      }
    }
  }

  // Join all description parts
  if (descriptionParts.length > 0) {
    data.description = descriptionParts.join(' | ');
  }

  console.log('Extracted description parts:', descriptionParts.length);

  // Get ALL images from the listing and convert to base64
  // Try multiple selectors to find images
  let images = document.querySelectorAll('img[src*="scontent"]');

  // If no scontent images, try other patterns
  if (images.length === 0) {
    console.log('No scontent images found, trying alternative selectors...');
    images = document.querySelectorAll('img[src*="fbcdn"]');
  }

  if (images.length === 0) {
    images = document.querySelectorAll('img[src*="facebook"]');
  }

  // Fallback: get all images on page
  if (images.length === 0) {
    console.log('No Facebook CDN images found, getting all images...');
    images = document.querySelectorAll('img');
  }

  console.log(`=== IMAGE SCRAPING DEBUG ===`);
  console.log(`Found ${images.length} total images on page`);

  const base64Images = [];
  let skippedCount = 0;
  let failedCount = 0;

  for (const img of images) {
    // Skip small images, emojis, icons, and UI elements
    if (!img.src ||
        img.src.includes('emoji') ||
        img.src.includes('icon') ||
        img.naturalWidth < 100 ||
        img.naturalHeight < 100) {
      skippedCount++;
      continue;
    }

    console.log(`Processing image ${base64Images.length + 1}: ${img.naturalWidth}x${img.naturalHeight}px from ${img.src.substring(0, 80)}...`);

    // Wait for image to load if needed
    if (!img.complete) {
      console.log('Image not loaded yet, waiting...');
      await new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 2000); // Increased timeout to 2 seconds
      });
    }

    // Convert to base64
    const base64 = await imageToBase64(img);
    if (base64) {
      console.log(`✓ Successfully converted image ${base64Images.length + 1}: ${img.naturalWidth}x${img.naturalHeight}px, base64 length: ${base64.length}`);
      base64Images.push(base64);
    } else {
      console.error(`✗ Failed to convert image: ${img.src.substring(0, 100)}`);
      failedCount++;
    }

    // Limit to 10 images max to avoid huge payloads
    if (base64Images.length >= 10) {
      console.log('Reached 10 image limit, stopping conversion');
      break;
    }
  }

  console.log(`=== IMAGE CONVERSION SUMMARY ===`);
  console.log(`Total images found: ${images.length}`);
  console.log(`Skipped (too small/emoji/icon): ${skippedCount}`);
  console.log(`Successfully converted: ${base64Images.length}`);
  console.log(`Failed to convert: ${failedCount}`);
  console.log(`================================`);

  data.images = base64Images;

  // Debug logging
  console.log('=== Facebook Scrape Results ===');
  console.log('Title:', data.title);
  console.log('Price:', data.price);
  console.log('Description length:', data.description?.length || 0);
  console.log('Image count:', data.images.length);
  console.log('URL:', data.url);
  console.log('================================');

  // Warning if critical data is missing or suspicious
  if (!data.title) {
    console.warn('WARNING: No title found! Page may have unusual structure.');
    console.log('Sample page text (first 500 chars):', pageText.substring(0, 500));
  } else if (isExcluded(data.title)) {
    console.warn('WARNING: Title looks like UI text:', data.title);
    console.log('This may not be the actual product title.');
  }

  if (!data.price) {
    console.warn('WARNING: No price found! Page may have unusual structure.');
  }

  return data;
}

async function scrapeCraigslist() {
  const data = {
    title: '',
    price: '',
    description: '',
    images: [],
    url: window.location.href
  };

  // Craigslist has more consistent structure
  const titleElement = document.querySelector('#titletextonly, .postingtitle');
  if (titleElement) {
    data.title = titleElement.textContent.trim();
  }

  const priceElement = document.querySelector('.price');
  if (priceElement) {
    data.price = priceElement.textContent.trim();
  }

  const descriptionElement = document.querySelector('#postingbody, .postingbody');
  if (descriptionElement) {
    // Remove "QR Code Link to This Post" text
    let desc = descriptionElement.textContent.trim();
    desc = desc.replace(/QR Code Link to This Post/g, '').trim();
    data.description = desc;
  }

  // For Craigslist, we can keep URLs since they're publicly accessible
  const images = document.querySelectorAll('.slide img, .thumb img, #thumbs img');
  const imageUrls = new Set();

  images.forEach(img => {
    if (img.src) {
      // Get full size image URL
      const fullSizeUrl = img.src.replace(/50x50c|300x300|600x450/g, '1200x900');
      imageUrls.add(fullSizeUrl);
    }
  });

  data.images = Array.from(imageUrls);

  return data;
}

async function scrapeOfferUp() {
  const data = {
    title: '',
    price: '',
    description: '',
    images: [],
    url: window.location.href
  };

  // OfferUp structure
  const titleElement = document.querySelector('h1[data-testid="item-title"], h1');
  if (titleElement) {
    data.title = titleElement.textContent.trim();
  }

  const priceElement = document.querySelector('[data-testid="item-price"], .price');
  if (priceElement) {
    data.price = priceElement.textContent.trim();
  }

  const descriptionElement = document.querySelector('[data-testid="item-description"], .description');
  if (descriptionElement) {
    data.description = descriptionElement.textContent.trim();
  }

  // OfferUp images might be public, keep as URLs
  const images = document.querySelectorAll('img[src*="images.offerup.com"], .item-image img');
  const imageUrls = new Set();

  images.forEach(img => {
    if (img.src && !img.src.includes('avatar') && !img.src.includes('icon')) {
      imageUrls.add(img.src);
    }
  });

  data.images = Array.from(imageUrls);

  return data;
}

async function scrapeGeneric() {
  const data = {
    title: '',
    price: '',
    description: '',
    images: [],
    url: window.location.href
  };

  // Generic fallback scraping
  const h1 = document.querySelector('h1');
  if (h1) {
    data.title = h1.textContent.trim();
  }

  // Look for price patterns
  const allText = document.body.innerText;
  const priceMatch = allText.match(/\$[\d,]+(?:\.\d{2})?/);
  if (priceMatch) {
    data.price = priceMatch[0];
  }

  // Get first paragraph as description
  const paragraphs = document.querySelectorAll('p');
  for (const p of paragraphs) {
    if (p.textContent.trim().length > 50) {
      data.description = p.textContent.trim();
      break;
    }
  }

  // Get ALL images
  const images = document.querySelectorAll('img');
  const imageUrls = new Set();

  images.forEach(img => {
    if (img.src && img.width > 100 && img.height > 100) {
      imageUrls.add(img.src);
    }
  });

  data.images = Array.from(imageUrls);

  return data;
}
