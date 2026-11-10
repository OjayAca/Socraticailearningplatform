export interface MethodReference {
  name: string;
  statement: string;
  variables: Record<string,string>;
  conditions: string[];
  commonMisconceptions: string[];
  acceptedJustifications: string[];
}
const reference = (name:string,statement:string,variables:Record<string,string>,conditions:string[],commonMisconceptions:string[],acceptedJustifications:string[]):MethodReference => ({name,statement,variables,conditions,commonMisconceptions,acceptedJustifications});
/** General definitions for the bounded, deterministically checked custom-problem families. */
export const METHOD_REFERENCES: Record<string,MethodReference> = {
  mean:reference("Arithmetic mean","mean = sum(x_i)/n",{x_i:"An observation",n:"Number of observations"},["Nonempty finite numerical dataset","Each observation has equal weight"],["Dividing by the largest value instead of the count"],["Explain that equal sharing preserves the total across n observations"]),
  median:reference("Median","Middle ordered value; average the two middle values when n is even",{n:"Number of observations"},["Order a nonempty numerical dataset"],["Using the middle input before sorting"],["Use ordered positions to split the observations into two halves"]),
  mode:reference("Mode","Value or values with greatest frequency",{},["Count every occurrence","In this application's stated convention, all distinct values give no mode"],["Assuming a dataset always has exactly one mode"],["Compare frequencies and retain all ties for the greatest repeated frequency"]),
  range:reference("Range","max(x_i) - min(x_i)",{x_i:"An observation"},["Nonempty numerical dataset"],["Subtracting first and last unsorted observations"],["Identify the largest and smallest observations before subtraction"]),
  probability:reference("Equally likely outcome probability","P(E) = favorable / total",{E:"Event",favorable:"Number of event outcomes",total:"Number of sample-space outcomes"},["Outcomes are equally likely","Total is positive","The event is a subset of the sample space"],["Using counts when outcomes are not equally likely"],["Explain equal likelihood and identify the event and full sample space"]),
  product:reference("Multiplication principle","N = n_1 * ... * n_k",{n_i:"Available choices at stage i"},["Each partial choice permits the stated number of choices at the next stage"],["Multiplying counts that depend on previous choices without accounting for that dependence"],["Describe the successive stages and verify the available choices at each stage"]),
  permutation:reference("Ordered selection without replacement","P(n,r) = n!/(n-r)!",{n:"Distinct available objects",r:"Objects selected"},["0 <= r <= n are integers","Order matters","No replacement"],["Using permutations for unordered groups"],["Explain why changing order changes the outcome and why choices cannot repeat"]),
  combination:reference("Unordered selection without replacement","C(n,r) = n!/[r!(n-r)!]",{n:"Distinct available objects",r:"Objects selected"},["0 <= r <= n are integers","Order does not matter","No replacement"],["Counting different arrangements of the same group separately"],["Explain why each unordered group appears r! times among ordered selections"]),
  "function evaluation":reference("Function evaluation","f(a) is obtained by substituting a for every x in the given expression",{a:"Input in the domain",x:"Function argument"},["Use the supplied function and an input in its domain","Respect parentheses and operation order"],["Treating a negative input squared as a negative square"],["Explain substitution into the supplied expression and check that the input is allowed"]),
  logic:reference("Propositional connectives","NOT reverses truth; AND requires both true; OR requires at least one true",{},["Each variable has a truth assignment","Respect parentheses and connective precedence"],["Treating inclusive OR as exclusive OR"],["Apply the relevant truth-table row to each subexpression"]),
  union:reference("Set union","A union B contains elements in A or B or both",{A:"First set",B:"Second set"},["Membership is decisive; duplicates do not change a set"],["Retaining only shared members"],["Check membership in at least one operand and remove duplicates"]),
  intersection:reference("Set intersection","A intersection B contains elements in both A and B",{A:"First set",B:"Second set"},["Each included element belongs to both operands"],["Including elements in only one operand"],["Verify membership in both sets for each included element"]),
  difference:reference("Set difference","A minus B contains elements in A that are not in B",{A:"First set",B:"Second set"},["Operand order matters"],["Treating difference as commutative"],["Check membership in A and absence from B"]),
};
for (const population of [true,false]) {
  const prefix=population ? "population" : "sample";
  const variance=reference(`${prefix} variance`,population ? "variance = sum((x_i - mean)^2)/n" : "s^2 = sum((x_i - mean)^2)/(n-1)",{x_i:"Observation",n:"Number of observations"},
    [population ? "The dataset is the full population; n >= 1" : "The observations form a sample; n >= 2", "Use squared deviations from the arithmetic mean"],
    ["Confusing the population and sample denominators","Averaging signed deviations without squaring"],
    ["Identify population versus sample from the question and justify its denominator"]);
  METHOD_REFERENCES[`${prefix} variance`]=variance;
  METHOD_REFERENCES[`${prefix} standard deviation`]={...variance,name:`${prefix} standard deviation`,statement:`standard deviation = sqrt(${prefix} variance)`,commonMisconceptions:[...variance.commonMisconceptions,"Omitting the final square root"],acceptedJustifications:[...variance.acceptedJustifications,"Explain that the square root restores the original measurement units"]};
}
