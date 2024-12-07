import * as z from "zod";

// Import the Genkit core libraries and plugins.
import { defineTool, generate, retrieve } from "@genkit-ai/ai";
import { configureGenkit } from "@genkit-ai/core";
import { defineFlow, startFlowsServer } from "@genkit-ai/flow";
import { googleAI } from "@genkit-ai/googleai";
import { prompt } from "@genkit-ai/dotprompt";

// Import models from the Google AI plugin. The Google AI API provides access to
// several generative models. Here, we import Gemini 1.5 Flash.
import { gemini15Flash } from "@genkit-ai/googleai";
import { dotprompt } from "@genkit-ai/dotprompt";
import { defineSecret } from "firebase-functions/params";
const googleAIapiKey = defineSecret("GOOGLE_GENAI_API_KEY");

interface TimeOfDay {
    hour: number;
    minutes: number;
}

enum LevelOfCooking {
    BEGINNER = "BEGINNER",
    INTERMEDIATE = "INTERMEDIATE",
    ADVANCED = "ADVANCED",
}

enum Lifestyle {
    SEDENTARY = "SEDENTARY",
    ACTIVE = "ACTIVE",
    HECTIC = "HECTIC",
}

enum FlexiNutritionType {
    VEGETARIAN = "VEGETARIAN",
    NON_VEGETARIAN = "NON_VEGETARIAN",
    VEGAN = "VEGAN",
}

interface FlexiNutritionPreferences {
    type: FlexiNutritionType;
    spicePreferences: number;
    sweetOrHotPreferences: number;
    allergies: string[];
    dietaryRestrictions: string[];
}

interface HealthMetric {
    weight: number;
    height: number;
    waterPercentage: number | null;
    fatPercentage: number | null;
    boneMass: number | null;
    calories: number | null;
    bmi: number;
}

enum Gender {
    Male = "Male",
    Female = "Female",
    Other = "Other",
}

interface UserAddress {
    name: string;
    doorNumber: string;
    apartment: string;
    city: string;
    state: string;
    landmark: string;
    pincode: string;
}

interface User {
    name: string;
    email: string;
    address: UserAddress | null;
    age: number;
    lifestyle: Lifestyle;
    gender: string;
    dailyRoutine: [string, TimeOfDay][];
    levelOfCooking: LevelOfCooking;
    numberOfDishes: number;
    favouriteFoodItems: string[];
    flexiNutritionPreferences: FlexiNutritionPreferences;
    healthGoals: string[];
    healthIssues: string[];
    healthMetrics: HealthMetric[];
}

configureGenkit({
    plugins: [
        // Load the Google AI plugin. You can optionally specify your API key
        // by passing in a config object; if you don't, the Google AI plugin uses
        // the value from the GOOGLE_GENAI_API_KEY environment variable, which is
        // the recommended practice.
        googleAI({ apiKey: "AIzaSyBzykxoGDQMDXGdy7f2kf8xy5N-Fcrv3jQ" }),
        dotprompt({ dir: "prompts" })
    ],
    // Log debug output to tbe console.
    logLevel: "debug",
    // Perform OpenTelemetry instrumentation and enable trace collection.
    enableTracingAndMetrics: true,
});

export const imageRetrivalTool = defineTool({
    name: 'imageRetrival',
    description: 'Generates and image for the recipe based on the name',
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.string(),
}, async ({ name }): Promise<string> => {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?q=${name}&cx=05a8572eddfd645dc&imgSize=XLARGE&imgType=photo&num=1&searchType=image&key=AIzaSyAD1x87D--Ls4owd7tc8twvWezaRlLVVXY`);

    if (res.status === 200) {
        return (await res.json()).items[0].link;
    }
    else {
        return "null";
    }

})

// Define a simple flow that prompts an LLM to generate menu suggestions.
export const menuSuggestionFlow = defineFlow(
    {
        name: "forMenuGeneration",
        inputSchema: z.object({
            name: z.string(),
            email: z.string(),
            address: z.object({
                name: z.string(),
                doorNumber: z.string(),
                apartment: z.string(),
                city: z.string(),
                state: z.string(),
                landmark: z.string(),
                pincode: z.string(),
            }).optional(),
            age: z.number(),
            lifestyle: z.enum(Object.values(Lifestyle) as [string, ...string[]]),
            gender: z.string(),
            dailyRoutine: z.array(
                z.tuple([z.string(), z.object({ hour: z.number(), minutes: z.number() })])
            ),
            levelOfCooking: z.enum(Object.values(LevelOfCooking) as [
                string,
                ...string[]
            ]),
            numberOfDishes: z.number(),
            favouriteFoodItems: z.array(z.string()),
            flexiNutritionPreferences: z.object({
                type: z.enum(
                    Object.values(FlexiNutritionType) as [string, ...string[]]
                ),
                spicePreferences: z.number(),
                sweetOrHotPreferences: z.number(),
                allergies: z.array(z.string()),
                dietaryRestrictions: z.array(z.string()),
            }),
            healthGoals: z.array(z.string()),
            healthIssues: z.array(z.string()),
            healthMetrics: z.array(
                z.object({
                    weight: z.number(),
                    height: z.number(),
                    waterPercentage: z.number().optional(),
                    fatPercentage: z.number().optional(),
                    boneMass: z.number().optional(),
                    calories: z.number().optional(),
                })
            ),
        }),
        outputSchema: z.unknown(),
        // authPolicy: noAuth(),
        // httpsOptions : {
        //   secrets : [googleAIapiKey],
        //   cors: true,
        // }
    },
    async (subject) => {
        const {
            name,
            lifestyle,
            flexiNutritionPreferences,
            levelOfCooking,
            favouriteFoodItems,
            healthGoals,
            healthIssues,
            healthMetrics,
        } = subject;

        const agent = await prompt('menuSuggestionAgent');
        // if(agent === null){ 
        const result = await agent.generate({
            input: subject
        });
        // }
        const llmResponse = result.output();
        return llmResponse;
    }
);

// Start a flow server, which exposes your flows as HTTP endpoints. This call
// must come last, after all of your plug-in configuration and flow definitions.
// You can optionally specify a subset of flows to serve, and configure some
// HTTP server options, but by default, the flow server serves all defined flows.
startFlowsServer();