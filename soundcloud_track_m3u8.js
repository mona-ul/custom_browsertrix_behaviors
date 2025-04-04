class SoundcloudM3U8Behavior {
    static init() {
      return {
        state: { comments: 0 },
        opts: { breadth: Symbol("BREADTH_ALL") },
      };

    }
    static get id() {
      return "SoundcloudM3U8Behavior";
    }
  
    static isMatch() {
        console.log("Current URL: ", window.location.href);
        const pathRegex = /https?:\/\/.*/; // Match any URL with http or https
        return !!window.location.href.match(pathRegex);
      }
  
    async *run(ctx) {
      const Q = {
        buttonXPath1: "//*[@id='widget']/div[1]/div/div/div[2]/div[1]/div/div[1]/button", // Anführungszeichen korrigiert
        stopSelector1: "//*[@id='widget']/div[1]/div/div/div[3]/div/div[2]/a/div",
        buttonXPath2: "//*[@id='widget']/div[1]/div/div[1]/div/div/div[2]/div/div/div[1]/button", // Anführungszeichen korrigiert
        stopSelector2: "//*[@id='widget']/div[1]/div/div[3]/div/div[2]/a"
      };

      console.log("testttttt");

      // Get all loaded resources (including m3u8 files)
      const loadedResources = performance.getEntriesByType('resource');
      const loadedM3U8 = loadedResources
          .filter(resource => resource.name.includes('playlist.m3u8'))
          .map(resource => resource.name);
      console.log("Already loaded M3U8 URLs:", loadedM3U8);;
      ctx.log(`Already loaded M3U8 URLs: ${loadedM3U8}`);

      await SoundcloudM3U8Behavior.clickPlayButton(ctx, Q);

      if (loadedM3U8.length > 0) {
        // If loadedM3U8 has values
        console.log("M3U8 URLs found:", loadedM3U8);
        ctx.log(`Loaded M3U8 URLs: ${loadedM3U8.join(', ')}`);

        const segmentUrls = await SoundcloudM3U8Behavior.getSegments(ctx, loadedM3U8);
  
        if (Array.isArray(segmentUrls) && segmentUrls.length > 0) {
          console.log("Extracted Segments:", segmentUrls);
          ctx.Lib.getState(ctx, "Extracted segment URLs", segmentUrls.join(", "));
        
          await SoundcloudM3U8Behavior.requestSegmentUrls(ctx, segmentUrls);
        } else {
          console.warn("No valid segment URLs found.");
        }

      } else {
        console.log("No M3U8 URLs in initial load.");
        ctx.log("No M3U8 URLs initial load.");
        // If loadedM3U8 is empty
        ctx.log("Starting Soundcloud URL Interception...");
        const originalXHR = window.XMLHttpRequest;
  
        // Create a new class extending the original XMLHttpRequest
        class CustomXMLHttpRequest extends originalXHR {
          constructor() {
            super();
            this.addEventListener("load", async () => {
              const url = this.responseURL;
              if (url.includes("playlist.m3u8")) {
                console.log("Detected Soundcloud M3U8 URL:", url);
                ctx.log(`Detected Soundcloud M3U8 ${url}`);
  
                const segmentUrls = await SoundcloudM3U8Behavior.getSegments(ctx, url);
  
                if (Array.isArray(segmentUrls) && segmentUrls.length > 0) {
                  console.log("Extracted Segments:", segmentUrls);
                  ctx.Lib.getState(ctx, "Extracted segment URLs", segmentUrls.join(", "));
                
                  await SoundcloudM3U8Behavior.requestSegmentUrls(ctx, segmentUrls);
                } else {
                  console.warn("No valid segment URLs found.");
                }
              }
            });
          }
        }

        // Override the global XMLHttpRequest to use the custom one
        window.XMLHttpRequest = CustomXMLHttpRequest;
      }


    } 
  
    static async clickButtonAndWaitForStop(ctx, buttonXPath, stopSelector) {
      const { xpathNode } = ctx.Lib;
      const button = await xpathNode(buttonXPath);
      if (button) {
        console.log('Clicking play button...');
        await button.click();
        ctx.state.played = true;
        ctx.Lib.getState(ctx, "Play button clicked", "played"); // Use state without yield
  
      } else {
        console.warn('Play button not found!');
      }
    }
  
    static async clickPlayButton(ctx, Q) {
      if (await ctx.Lib.xpathNode(Q.buttonXPath1)) {
        await SoundcloudM3U8Behavior.clickButtonAndWaitForStop(ctx, Q.buttonXPath1, Q.stopSelector1);
      } else if (await ctx.Lib.xpathNode(Q.buttonXPath2)) {
        await SoundcloudM3U8Behavior.clickButtonAndWaitForStop(ctx, Q.buttonXPath2, Q.stopSelector2);
      }
    }
  
    static async getSegments(ctx, m3u8Url) {
  
      try {
        const m3u8Data = await fetch(m3u8Url).then(res => res.text());
        console.log("get segments M3U8 playlist:", m3u8Data);
        const regexMatch = /https:\/\/cf-hls-media\.sndcdn\.com[^\s]*/g;
        const segmentMatches = [...m3u8Data.matchAll(regexMatch)];
        console.log("Segment Matches:", segmentMatches);
    
        return segmentMatches.map((match, index) => {
          console.log(`Match ${index}:`, match); // Log each match for inspection
          return match[0]; // match[0] should be the entire matched URL
        });
      } catch (error) {
        console.error("Error fetching M3U8 playlist:", error);
        return [];
      }
    }
  

static async requestSegmentUrls(ctx, segmentUrls) {
  if (!Array.isArray(segmentUrls) || segmentUrls.length === 0) {
    ctx.log("No URLs to request.");
    return;
  }

  ctx.log(`Total URLs to request: ${segmentUrls.length}`);

  const headers = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en,de;q=0.7,en-US;q=0.3",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://w.soundcloud.com",
    "DNT": "1",
    "Connection": "keep-alive",
    "Referer": "https://w.soundcloud.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
  };

  const failedUrls = []; // Track failed URLs

  const fetchPromises = segmentUrls.map(async (url) => {
    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      try {
        const response = await fetch(url, { headers });
        if (response.ok) {
          ctx.log(`Successfully requested: ${url}`);
          success = true;
        } else {
          ctx.log(`Request failed for ${url}. Status: ${response.status}`);
        }
      } catch (error) {
        ctx.log(`Failed to request ${url}:`, error);
      }

      attempts++;
      if (!success) {
        ctx.log(`Retrying ${url} (${attempts}/3)`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
      }
    }

    if (!success) {
      failedUrls.push(url); // Add the failed URL to the list
    }
  });

  await Promise.all(fetchPromises); // Ensure all requests complete before moving on

  ctx.log(`Failed URLs: ${failedUrls.length}`);
  failedUrls.forEach(url => ctx.log(`FAILED: ${url}`));

  if (failedUrls.length > 0) {
    ctx.log("The following URLs failed to be requested:");
    failedUrls.forEach(url => ctx.log(url)); // Print all failed URLs
  } else {
    ctx.log("All URLs have been requested successfully.");
  }
}

}
