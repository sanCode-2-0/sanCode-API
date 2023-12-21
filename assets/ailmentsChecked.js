async function fetchData() {
  try {
    const response = await fetch("http://localhost:6969/disease");
    return response.json();
  } catch (error) {
    // Handle any errors
    console.error(error);
    throw error;
  }
}

async function loadData() {
  try {
    const response = await fetchData();
    const data = response;
    const values = [];
    for (let counter = 0; counter < data.length; counter++) {
      values.push(data[counter].disease);
    }
    return values;
  } catch (error) {
    // Handle any errors
    console.error(error);
    throw error;
  }
}

// Exporting loadData function directly (no need to export ailmentsChecked)
export default loadData;
