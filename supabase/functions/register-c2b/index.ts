
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const MpesaConsumerKey = Deno.env.get('MPESA_CONSUMER_KEY') || "";
const MpesaConsumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') || "";
const ShortCode = Deno.env.get('MPESA_SHORTCODE') || "4166191";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken() {
  const credentials = btoa(`${MpesaConsumerKey}:${MpesaConsumerSecret}`);
  const response = await fetch("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
    headers: { "Authorization": `Basic ${credentials}` }
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to get Daraja access token: ${errText}`);
  }
  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    console.log('Using Keys:', MpesaConsumerKey.substring(0, 5) + '...', MpesaConsumerSecret.substring(0, 5) + '...');
    const token = await getAccessToken();
    console.log('Got Token:', token.substring(0, 10) + '...');
    
    const callbackUrl = "https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/daraja-c2b-callback";
    
    const payload = {
      ShortCode: ShortCode,
      ResponseType: "Completed",
      ConfirmationURL: callbackUrl,
      ValidationURL: callbackUrl
    };

    const res = await fetch("https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('RegisterURL Response:', JSON.stringify(data));
    
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (err) {
    console.error('Fatal Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
