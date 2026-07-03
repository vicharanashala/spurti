/**
 * Transcript Provider Module
 * Exposes only one main function to fetch the morning session transcript.
 * 
 * Future Integration Note:
 * To integrate with Zoom Meeting API or Zoom Cloud Recordings API:
 * 1. Fetch transcript/captions from the target meeting using zoom SDK/API.
 * 2. Return the transcript text string.
 * This is the ONLY file that needs modification to change transcript source.
 */

const HARDCODED_TRANSCRIPT = `Sudarshan Sir (Opening)
Good morning everyone! I hope all of you are doing well. Before we begin today's technical session, let's quickly go over the rules for the Matrixs Mystic Activity.
Matrixs Mystic is designed around trust and knowledge sharing. You should only request endorsements after you've genuinely understood and defended a question.
The process is simple:
Pick a question that you can confidently defend.
Find a peer or mentor who already holds that question.
Request a viva.
If they are convinced by your explanation, they will endorse you.
Please remember, never spam endorsement requests.
Raise an endorsement request only after the mentor has actually taken your viva and asked you to send the request.
Every request now includes your declaration confirming that the viva has already happened.
Also note an important new rule.
If your mentor doesn't respond to your endorsement request within 2 hours, your request expires and you lose 5% of your SPA. So it's always better to send the request immediately while you're still with the mentor.
Mutual endorsements are not allowed.
If you endorse someone for a question, they cannot endorse you back for the same question.
One person can endorse you for at most five questions. After that you'll need endorsements from different people to keep the trust network diverse.
Mentors can endorse at most ten learners per question.
Also remember that the person endorsing you must already possess that question.
You cannot request an endorsement for a question you already hold or already have a pending request for.
If a mentor rejects your request, wait around two hours before asking the same mentor again. However, you may approach another eligible mentor immediately.
Every pending request automatically expires after two hours.
Successful endorsements reward the mentor with 10% SPA.
However, if an endorsement fails an audit later, both the mentor and learner lose 20% SPA.
So endorse responsibly.
Finally, every question originates from the instructor. The instructor is the root holder, and the knowledge spreads outward through trusted endorsements.
Great! Let's begin today's learning session.

Aditya Sir (Linear Algebra with GeoGebra)
Good morning everyone.
Today we're going to explore Linear Algebra visually using GeoGebra.
Many students think vectors and matrices are purely mathematical objects. GeoGebra helps us see them as geometric transformations.
Let's begin with vectors.
Suppose we have the vector (2,3).
I'll plot this on the coordinate plane.
Notice that every vector starts from the origin and points toward its destination.
Now let's create another vector (4,1).
GeoGebra immediately shows both vectors.
What happens if we add them?
The resulting vector becomes (6,4).
Notice how vector addition follows the parallelogram rule.
Next, let's understand matrices.
Consider the matrix
[
1 2
3 4
]
Instead of viewing this as just four numbers, think of it as a transformation.
GeoGebra allows us to apply this transformation to different vectors.
Watch carefully.
I'll apply this matrix to the vector (1,1).
The transformed vector changes its direction and magnitude.
This is the power of linear transformations.
Now let's try another matrix.
We'll use the rotation matrix.
Observe how every point rotates while preserving its distance from the origin.
Similarly, scaling matrices stretch objects, while reflection matrices flip them across an axis.
GeoGebra makes these concepts much easier to understand than static textbook diagrams.
I encourage everyone to experiment with different matrices after today's class.
During today's SP Booster Quiz, you may see conceptual questions related to vectors, transformations, and matrix operations discussed in this session.
That's all for today's lecture.
Thank you everyone.`;

/**
 * Returns the morning session transcript text.
 * @param {string} [sessionLabel] - Optional label for the session.
 * @returns {Promise<string>} The transcript text.
 */
export async function getMorningTranscript(sessionLabel) {
  // In the future:
  // const zoomId = await getZoomIdForSession(sessionLabel);
  // return await fetchTranscriptFromZoom(zoomId);
  return HARDCODED_TRANSCRIPT;
}
