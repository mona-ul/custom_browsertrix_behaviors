class VimeoFetch {
  static init() {
    return {
      state: { comments: 0 },
      opts: { breadth: Symbol("BREADTH_ALL") },
    };
  }

  static get id() {
    return "VimeoFetch";
  }

  static isMatch() {
    const pathRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)?vimeo\.com/;
    return !!window.location.href.match(pathRegex);
  }

  async *run(ctx) {
    ctx.log("In Vimeo Behavior");

    // Click Play
    await VimeoFetch.clickPlayButton(ctx);


    const { playerUrls, player_json} = await VimeoFetch.readPlayerConfig(ctx);
        

    /// get player urls
    if (playerUrls && playerUrls.length > 0) {
      ctx.Lib.getState(ctx, "Extracted segment URLs", playerUrls.join(", "));
      await VimeoFetch.requestAllUrls(playerUrls, [], [], ctx);
    } else {
      console.warn("No valid playerUrls found.");
    }

    // Arrays for Video and Segment URLs
    const videoUrls = [];
    const audioUrls = [];

    /// get playlist.json urls
    if (player_json && player_json.includes("vimeocdn.com") && player_json.includes("playlist.json")) {
      console.log("Detected Vimeo playlist.json URL:", player_json);
      ctx.log(`Extracted player_json URL: ${player_json}`);

      const parsedUrl = new URL(player_json);
      ctx.log(`parsedUrl: ${parsedUrl}`);
      const pathSegments = parsedUrl.pathname.split('/').filter(segment => segment);
      const firstThreeSegments = pathSegments.slice(0, 3);
      
      try {
        const response = await fetch(parsedUrl);
        
        // Check if the response is successful
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
      
        // Parse the response as JSON
        const jsonResponse = await response.json();    

        const baseUrl = `https://vod-adaptive-ak.vimeocdn.com/${firstThreeSegments.join('/')}/remux/avf/`;
        console.log("Base URL:", baseUrl);

        // Process Video URLs
        if (jsonResponse.video && jsonResponse.video.length > 0) {
          jsonResponse.video.forEach((video) => {
            const videoBaseUrl = video.base_url;
            if (video.segments && video.segments.length > 0) {
              video.segments.forEach((segment) => {
                const fullUrl = new URL(segment.url, baseUrl + videoBaseUrl).href;
                console.log(`Extracted Video URL: ${fullUrl}`);
                ctx.log(`Extracted Video URL: ${fullUrl}`);
                videoUrls.push(fullUrl);
              });
            }
          });
        }

        // Process Audio URLs
        if (jsonResponse.audio && jsonResponse.audio.length > 0) {
          jsonResponse.audio.forEach((audio) => {
            const audioBaseUrl = audio.base_url;
            if (audio.segments && audio.segments.length > 0) {
              audio.segments.forEach((segment) => {
                const fullUrl = new URL(segment.url, baseUrl + audioBaseUrl).href;
                console.log(`Extracted Audio URL: ${fullUrl}`);
                ctx.log(`Extracted Audio URL: ${fullUrl}`);
                audioUrls.push(fullUrl);
              });
            }
          });
        }

        console.log("Final Video URLs:", videoUrls);
        console.log("Final Audio URLs:", audioUrls);
        ctx.log("Extracted all URLs, now requesting...");
        
        VimeoFetch.stopVideo(ctx);
        
        // Request Segment URLs
        await VimeoFetch.requestAllUrls([], videoUrls, audioUrls, ctx);

      } catch (error) {
        console.error("Failed to parse or extract the data:", error);
      }
    } else {
      console.warn("No valid segment URLs found.");
    }
  }

  static async clickPlayButton(ctx) {
    const playButton = document.querySelector("button[data-play-button]");
    if (playButton) {
      playButton.click();
      console.log("Play button clicked.");
      ctx.log("Play button clicked.");
    } else {
      console.warn("Play button not found.");
      ctx.log("Play button not found.");
    }
  }

  static async readPlayerConfig(ctx) {
    let playerUrls = [];
    let player_json = null;
    const scriptTags = document.querySelectorAll('script');
    console.log("script tags:", scriptTags);
    ctx.log(`script tags: ${scriptTags}`);
    for (let script of scriptTags) {
      const scriptContent = script.innerHTML;

      if (scriptContent && scriptContent.startsWith('window.playerConfig = {"cdn_url":')) {
        console.log("windows.playerConfig found");
        ctx.log(`windows.playerConfig found`);
        console.log("script content:", scriptContent);
        ctx.log(`script content: ${scriptContent}`);

        const regex = /window\.playerConfig\s*=\s*(\{.*\})/;
        const match = scriptContent.match(regex);

        function extractUrls(obj, collected = []) {
          for (const key in obj) {
            if (!obj.hasOwnProperty(key)) continue;
            const value = obj[key];
      
            if (typeof value === 'string' && value.startsWith('http')) {
              collected.push(value);
            } else if (typeof value === 'object' && value !== null) {
              extractUrls(value, collected);
            }
          }
          return collected;
        }

        if (match && match[1]) {
          try {
              const playerConfig = JSON.parse(match[1]);
              console.log("playerConfig:", playerConfig);
              ctx.log(`playerConfig: ${JSON.stringify(playerConfig, null, 2)}`);

              // Check if playerConfig has 'request' and 'urls'
              if (playerConfig && playerConfig.request && playerConfig.request.urls) {
                const request_urls = playerConfig.request.urls;

                // Recursively extract all URLs
                playerUrls = extractUrls(request_urls);
                ctx.log(`Extracted URLs:\n${playerUrls.join('\n')}`);
              } else {
                console.warn("No 'request.urls' found in the playerConfig.");
              }

              if (
                playerConfig &&
                playerConfig.request &&
                playerConfig.request.files &&
                playerConfig.request.files.dash &&
                playerConfig.request.files.dash.cdns &&
                playerConfig.request.files.dash.cdns.akfire_interconnect_quic &&
                playerConfig.request.files.dash.cdns.akfire_interconnect_quic.avc_url
              ) {
                player_json = playerConfig.request.files.dash.cdns.akfire_interconnect_quic.avc_url;
                ctx.log(`Extracted player_json URL: ${player_json}`);
                console.log("Found player_json URL:", player_json);
              } else {
                console.warn("No 'player_json' found in the playerConfig.");
              }

            } catch (error) {
                console.error("Error parsing playerConfig:", error);
            }
          }
        }
      }

    return { playerUrls, player_json };  // Return empty array if no config found
}

  static async stopVideo(ctx) {
      const videoElement = document.querySelector("video");
      if (videoElement) {
        videoElement.pause();
        console.log("Video stopped.");
        ctx.log("Video stopped.");
      } else {
        console.warn("Video element not found.");
        ctx.log("Video element not found.");
      }
  }

  static async requestAllUrls(playerurls, videoUrls, audioUrls, ctx) {
      const allUrls = [...playerurls, ...videoUrls, ...audioUrls];
    
      if (allUrls.length === 0) {
        ctx.log("No URLs to request.");
        return;
      }
    
      ctx.log(`Total URLs to request: ${allUrls.length}`);
    
      const headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en,de;q=0.7,en-US;q=0.3",
        "Origin": "https://player.vimeo.com",
        "DNT": "1",
        "Referer": "https://player.vimeo.com",
      };
    
      const failedUrls = [];  // Track failed URLs
    
      const fetchPromises = allUrls.map(async (url) => {
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
            ctx.log(`Failed to request ${url}`);
          }
    
          attempts++;
    
          if (!success) {
            ctx.log(`Retrying ${url} (${attempts}/3)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
    
        if (!success) {
          failedUrls.push(url);  // Add the failed URL to the list
        }
      });
    
      await Promise.all(fetchPromises);  // Ensure all requests complete before moving on
      ctx.log(`Failed URLs: ${failedUrls.length}`);
      failedUrls.forEach(url => ctx.log(`FAILED: ${url}`));
      if (failedUrls.length > 0) {
        ctx.log("The following URLs failed to be requested:");
        failedUrls.forEach(url => ctx.log(url));  // Print all failed URLs
      } else {
        ctx.log("All URLs have been requested successfully.");
      }
    }
    
}
