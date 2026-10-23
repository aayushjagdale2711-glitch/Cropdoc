import json
import requests
from config import Config
import logging

logging.basicConfig(
    filename='ai.log',
    filemode='w',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

def analyze_crop(base64_image, mime_type, description):
    logging.info("Analysing image")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{Config.MODEL_NAME}:generateContent?key={Config.GEMINI_API_KEY}"
    print('reached server')
    
    prompt_text = (
        "You are CropDoctor, an elite, expert AI agronomist and plant pathologist. Your primary task is to run a deep diagnostic assessment on crop diseases, pest infestations, or nutrient deficiencies from user-provided images and optional text descriptions.\n"
        "You must output your response EXCLUSIVELY as a valid JSON object. No markdown wrappers, no introductory text, no conversational padding.\n"
        "Use a language that is understandable for normal people. If you use some scientific term, explain it.\n"
        "You must never hallucinate. If you are uncertain about the diagnosis, state your uncertainty clearly and mandate that the user consults a human agronomist.\n"
        "First, evaluate the image quality. If the image is entirely irrelevant to agriculture, completely blurry, too dark, or the plant damage is obstructed, you must set \"image_quality_acceptable\" to false and provide a precise \"rejection_reason\".\n"
        "If acceptable, provide a exhaustive diagnostic profile.\n\n"
        "Expected JSON Schema:\n"
        "{\n"
        "  \"image_quality_acceptable\": true,\n"
        "  \"rejection_reason\": \"\",\n"
        "  \"crop_identified\": \"Common Name of the crop (e.g., Tomato, Wheat)\",\n"
        "  \"scientific_name\": \"Taxonomic/Scientific name of the crop and/or the pathogen if applicable\",\n"
        "  \"diagnosis\": \"Specific disease, pest infestation, or nutrient deficiency identified.\",\n"
        "  \"confidence_score\": \"Percentage representing diagnostic confidence (e.g., 92%)\",\n"
        "  \"severity\": \"Must be exactly 'Low', 'Medium', 'High', or 'N/A'\",\n"
        "  \"symptoms_observed\": [\n"
        "    \"Array of specific visual markers spotted on leaves, stems, or fruit in the image (minimum 2 detailed points)\"\n"
        "  ],\n"
        "  \"environmental_factors\": [\n"
        "    \"Array of microclimates, weather patterns, or soils that accelerate this condition\"\n"
        "  ],\n"
        "  \"next_steps\": [\n"
        "    \"Array of immediate, step-by-step physical or cultural mitigation strategies\"\n"
        "  ],\n"
        "  \"organic_solutions\": [\n"
        "    \"Array of organic, biological, or eco-friendly treatment options\"\n"
        "  ],\n"
        "  \"chemical_solutions\": [\n"
        "    \"Array of target chemical applications or synthetic pesticides/fungicides if required\"\n"
        "  ],\n"
        "  \"prevention_techniques\": [\n"
        "    \"Array of structural, long-term agronomic habits to prevent future occurrences\"\n"
        "  ],\n"
        "  \"follow_up_questions\": [\n"
        "    \"Array of clarifying questions to ask the user to further narrow down crop health history\"\n"
        "  ],\n"
        "  \"additional_notes\": \"An expert summary or field advisory note regarding the outbreak.\"\n"
        "}"
    )
    
    if description and description.strip():
        prompt_text += f"\nUser notes: {description}"

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt_text},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": base64_image
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.15
        }
    }

    headers = {"Content-Type": "application/json"}
    response = requests.post(url, json=payload, headers=headers)
    logging.info(response.text)
    response.raise_for_status()

    data = response.json()
    raw_text = data['candidates'][0]['content']['parts'][0]['text'].strip()
    
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
        
    return json.loads(raw_text.strip())


def analyze_followup(base64_image, mime_type, previous_diagnosis, chat_history, user_message):
    """
    Executes a contextual agronomic follow-up consultation.
    Keeps track of chat history, matching base64 image data, and raw diagnostic targets.
    """
    logging.info("Analysing user follow-up")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{Config.MODEL_NAME}:generateContent?key={Config.GEMINI_API_KEY}"
    
    formatted_chat = ""
    for turn in chat_history:
        speaker = "User" if turn['role'] == 'user' else "CropDoctor AI"
        formatted_chat += f"{speaker}: {turn['content']}\n"

    prompt_text = (
        "You are CropDoctor, an elite expert AI agronomist and plant pathologist.\n"
        "The user is holding an ongoing follow-up consultation with you regarding their crop diagnostic scan.\n\n"
        f"Original Crop Health Target Diagnosis: {previous_diagnosis}\n"
        f"Conversation History so far:\n{formatted_chat}\n"
        f"New user follow-up message: {user_message}\n\n"
        "Using the image details, previous notes, and current question, generate a deep-level, helpful response.\n"
        "You must output your response EXCLUSIVELY as a valid JSON object matching this schema:\n"
        "{\n"
        "  \"reply\": \"Detailed text answer explaining dynamic options, answering question accurately in clear sentences (minimum 2 sentences). Use clean formatting.\",\n"
        "  \"new_actions\": [\"Array of specific action steps or adjustments discussed, if any. Empty array if none.\"],\n"
        "  \"treatment_notes\": [\"Array of chemical or organic warnings, product names, safety procedures, or intervals discussed. Empty array if none.\"]\n"
        "}"
    )

    parts = [{"text": prompt_text}]
    
    if base64_image and mime_type:
         parts.append({
             "inlineData": {
                 "mimeType": mime_type,
                 "data": base64_image
             }
         })

    payload = {
        "contents": [
            {
                "parts": parts
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.25
        }
    }

    headers = {"Content-Type": "application/json"}
    response = requests.post(url, json=payload, headers=headers)
    logging.info("Follow-up raw return payload tracked:")
    response.raise_for_status()

    data = response.json()
    raw_text = data['candidates'][0]['content']['parts'][0]['text'].strip()
    
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
        
    return json.loads(raw_text.strip())