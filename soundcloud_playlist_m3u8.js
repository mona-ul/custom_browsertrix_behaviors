class SoundcloudM3U8BehaviorPlaylist {
    static init() {
      return {
        state: { comments: 0, m3u8Urls: []},
        opts: { breadth: Symbol("BREADTH_ALL") },
      };
    }

    static get id() {
      return "SoundcloudM3U8BehaviorPlaylist";
    }

    static isMatch() {
      console.log("Current URL: ", window.location.href);
      const pathRegex = /https?:\/\/.*/; // Match any URL with http or https
      return !!window.location.href.match(pathRegex);
    }

    async* run(ctx) {
        ctx.log("In Soundcloud Playlist Behavior");
        console.log("In Soundcloud Playlist Behavior");

        this.setupInterception(ctx);
        
        await this.getTracks(ctx);  
        ctx.log("print segment urls");
        ctx.log("M3U8 URLs: " + ctx.state.m3u8Urls.join(", "));
        ctx.log("test3");

        for (const m3u8Url of ctx.state.m3u8Urls) {
            ctx.log("test4");
            ctx.log("m3u8Url: " + m3u8Url);

            let segmentUrls;
            try {
                segmentUrls = await SoundcloudM3U8BehaviorPlaylist.getSegments(ctx, m3u8Url);
                ctx.log("Segment URLs: " + JSON.stringify(segmentUrls));
            } catch (error) {
                ctx.log("Error getting segments:", error.message, error.stack);
            }
            ctx.log("test6");

            if (Array.isArray(segmentUrls) && segmentUrls.length > 0) {
                ctx.log("test5");
                //console.log("Extracted Segments:", segmentUrls);
                //ctx.Lib.getState(ctx, "Extracted segment URLs", segmentUrls.join(", "));
                await SoundcloudM3U8BehaviorPlaylist.requestSegmentUrls(ctx, segmentUrls);
            } else {
                console.warn("No valid segment URLs found.");
            }
        }
        yield "SoundCloud Play Behavior Complete";
    }      

    setupInterception(ctx) {
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
                ctx.log("test1");
  
                if (!ctx.state.m3u8Urls.includes(url)) {
                  ctx.state.m3u8Urls.push(url);
                }
                ctx.log("test2");
              }
            });
          }
        }
        window.XMLHttpRequest = CustomXMLHttpRequest;
    }

    async getTracks(ctx){
        ctx.log("Get Tracks");
        const { xpathNode } = ctx.Lib;
        const Q = {
            buttonXPath: "//*[@id='widget']/div[1]/div/div/div[2]/div[1]/div/div[1]/button",
            titleXPath: "//*[@id='widget']/div[1]/div[1]/div/div/div[2]/div[1]/div/div[2]/div/a[2]/span"
        };    
    
        const listItems = document.querySelectorAll(
            "ul.lazyLoadingList__list.sc-list-nostyle.sc-clearfix li.soundsList__item.g-border-bottom"
        );

        if (listItems.length === 0) {
            console.warn("[WARN] No tracks found in the playlist.");
            return;
        }

        for (const li of listItems) {
            const soundItem = li.querySelector("div.soundItem");
    
            if (soundItem && soundItem instanceof HTMLElement) {
                ctx.log("Clicking on sound item...");
                console.log("[LOG] Clicking on sound item...");
        
                soundItem.click();
                ctx.state.playedTracks++;

                ctx.state.played = true;
                ctx.Lib.getState(ctx, "Play button clicked", "played");
    
                // Titel auslesen, bevor wir den Track wechseln
                const TitleElement = xpathNode(Q.titleXPath);
                const Title = TitleElement ? TitleElement.textContent.trim() : "";
                console.log("Title:", Title);
    
                await new Promise(resolve => setTimeout(resolve, 3000));
                soundItem.click();
            } else {
                console.warn("[WARN] No soundItem found inside li");
            }
        }
    }
      
    static async getSegments(ctx, m3u8Url) {
      ctx.log("Get Segments from M3U8 Playlists");
        try {
          const m3u8Data = await fetch(m3u8Url).then(res => res.text());
          //ctx.log("m3u8m3u8DataUrl: " + m3u8Data);
          //console.log("get segments M3U8 playlist:", m3u8Data);
          const regexMatch = /https:\/\/cf-hls-media\.sndcdn\.com[^\s]*/g;
          const segmentMatches = [...m3u8Data.matchAll(regexMatch)];
          //console.log("Segment Matches:", segmentMatches);
          //ctx.log("Segment Matches: " + segmentMatches);
      
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
      ctx.log("Request Segments");
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
