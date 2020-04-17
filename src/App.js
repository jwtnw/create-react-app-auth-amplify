import React, { Component } from 'react';
import Select from 'react-select';
import * as moment from 'moment';
import logo from './logo.svg';
import './App.css';
import { withAuthenticator } from 'aws-amplify-react'
import Amplify, { Auth } from 'aws-amplify';
import aws_exports from './aws-exports';
Amplify.configure(aws_exports);

const REGION = 'us-east-2';

Amplify.Storage.configure({
  AWSS3: {
    // bucket: 'covid-chi-1',
    // devm TEST ENVIRONMENT
    // bucket: 'covid-chi-105443-devm',
    // Deployed by pushes to master
    // prod ENVIRONMENT 
    bucket: 'covid-chi-1app-prod',
    region: REGION
  }
});

class App extends Component {

  constructor(props) {
    super(props);

    this.state = {
      activeChartLabel: "No chart to display",
      activeChartUrl: logo,

      username: "",
      verified: false,
      loadingCharts: true,
      patientIdOptions: [],
      possibleCharts: new Map(),
      selectedCharts: "",
      rawOptions: [],
      possibleRaw: new Map(),
      selectedRaw: "",

      coughChartUrl: "",
      heartRateChartUrl: "",
      physicalActivityChartUrl: "",
      temperatureChartUrl: "",
    };

    this.getUser();
  }

  getUser() {
    Auth.currentAuthenticatedUser().then((cognitoUser) => {
      console.log(cognitoUser)
      const userGroups = cognitoUser.signInUserSession.idToken.payload['cognito:groups'];
      let verified = false;
      console.log(userGroups)
      console.log(userGroups.indexOf("Verified"))
      if(userGroups && userGroups.indexOf('Verified') !== -1) {
        verified = true; 
      }
      console.log(verified)
      this.setState({username: cognitoUser.username, verified: verified}, () => {
        this.getCharts();
      })
    });
  }

  getCharts() {
    Amplify.Storage.list('')
      .then(result => {
        // Find all of the charts for a patient for a day
        const possibleCharts = new Map();
        const possibleRaw = new Map();
        result.forEach(element => {
          // const chartRegex = /patient_id=([a-zA-Z0-9]+)\/gender=[mfo]\/yyyymmdd=(\d{8})\/.*.png/
          const chartRegex = /([a-zA-Z0-9]+[m|f|M|F])\/sensor_data\/(\d\d)-(\d\d)-(\d\d)-(\d+)_(\d+)_(\d+).*\/(.*.png)/
          const matches = element.key.match(chartRegex)
          if(matches) {
            // MM-DD-YYYY HH:SS 
            let date = moment("20" + matches[2] + "-" + matches[3] + "-" + matches[4] + " " + matches[5] + ":" + matches[6], "YYYYMMDD HH:mm");
            date = date.subtract(6, 'hours')
            const label = matches[1] + " " + date.format('L') + " " + date.format('LT')
            if(matches[8] === 'heart_rate.png') {
              if(possibleCharts.has(label)) {
                possibleCharts.get(label).heart_rate = element.key;
              } else {
                possibleCharts.set(label, {heart_rate: element.key});
              }
            } else if(matches[8] === 'coughs.png') {
              if(possibleCharts.has(label)) {
                possibleCharts.get(label).cough = element.key;
              } else {
                possibleCharts.set(label, {cough: element.key});
              }
            } else if(matches[8] === 'physical_activity.png') {
              if(possibleCharts.has(label)) {
                possibleCharts.get(label).physical_activity = element.key;
              } else {
                possibleCharts.set(label, {physical_activity: element.key});
              }
            } else if(matches[8] === 'temperature.png') {
              if(possibleCharts.has(label)) {
                possibleCharts.get(label).temperature = element.key;
              } else {
                possibleCharts.set(label, {temperature: element.key});
              }
            } else {
              console.log("DON'T KNOW WHAT TO DO WITH " + matches[5] + " " + element.key)
            }
          }

          const h5Regex = /([a-zA-Z0-9]+[m|f|M|F])\/sensor_data\/(\d\d)-(\d\d)-(\d\d)-(\d+)_(\d+)_(\d+).*\/(.*)\/raw.h5/
          const h5Matches = element.key.match(h5Regex)
          if(element.key.endsWith(".h5")) {
          }
          if(h5Matches) {
            // MM-DD-YYYY HH:SS 
            console.log(h5Matches)
            let date = moment("20" + h5Matches[2] + "-" + h5Matches[3] + "-" + h5Matches[4] + " " + h5Matches[5] + ":" + h5Matches[6], "YYYYMMDD HH:mm");
            date = date.subtract(6, 'hours')
            const label = h5Matches[1] + " " + date.format('L') + " " + date.format('LT');
            possibleRaw.set(label, {h5: element.key})
          }
        });

        // Create a list of options for patients for a day
        const patientIdOptions = [];
        possibleCharts.forEach((value, key) => {
          patientIdOptions.push({value: key, label: key});
        });

        const rawOptions = [];
        possibleRaw.forEach((value, key) => {
          rawOptions.push({value: key, label: key});
        });

        this.setState({loadingCharts: false, patientIdOptions: patientIdOptions, possibleCharts: possibleCharts, rawOptions: rawOptions, possibleRaw: possibleRaw}, () => {
          if(this.state.patientIdOptions.length > 0) {
            console.log(this.state.patientIdOptions[0])
            console.log(this.state.possibleCharts)
            console.log(this.state.possibleCharts.get(this.state.patientIdOptions[0].value))
            this.handleSelectedChartsChange(this.state.patientIdOptions[0])
            console.log(this.state.rawOptions);
            this.handleSelectedRawChange(this.state.rawOptions[0])
          }
        });
      })
      .catch(err => console.log(err));
  }

  handleSelectedChartsChange(option) {
    this.setState({selectedCharts: option.value});
    const chartsToLoad = this.state.possibleCharts.get(option.value);
    if(chartsToLoad) {
      console.log(chartsToLoad)
      if(chartsToLoad.cough) {
        Amplify.Storage.get(chartsToLoad.cough)
        .then((result) => {
          console.log("Received authorized link for chart " + result);
          this.setState({coughChartUrl: result})
        })
        .catch(err => console.log(err));
      }
      if(chartsToLoad.heart_rate) {
        Amplify.Storage.get(chartsToLoad.heart_rate)
        .then((result) => {
          console.log("Received authorized link for chart " + result);
          this.setState({heartRateChartUrl: result})
        })
        .catch(err => console.log(err));
      }
      if(chartsToLoad.physical_activity) {
        Amplify.Storage.get(chartsToLoad.physical_activity)
        .then((result) => {
          console.log("Received authorized link for chart " + result);
          this.setState({physicalActivityChartUrl: result})
        })
        .catch(err => console.log(err));
      }
      if(chartsToLoad.temperature) {
        Amplify.Storage.get(chartsToLoad.temperature)
        .then((result) => {
          console.log("Received authorized link for chart " + result);
          this.setState({temperatureChartUrl: result})
        })
        .catch(err => console.log(err));
      }
    }
  }

  handleSelectedRawChange(option) {
    this.setState({selectedRaw: option.value});
  }

  handleDownloadRaw(event) {
    console.log(this.state.possibleRaw.get(this.state.selectedRaw));
    const key = this.state.possibleRaw.get(this.state.selectedRaw);
    if(key) {
      Amplify.Storage.get(key.h5)
        .then((result) => {
          console.log(result);
          let a = document.createElement('a');
          a.href = result;
          a.download = this.state.selectedRaw.replace(/ /g,"_").replace(/\//g,"_") + ".h5";
          a.target = "_blank";
          a.click();
        })
        .catch((error) => console.log(error));
    }
  }

  render() {
    const UnverifiedApp = () => (
      <div>
        <header className="App-header">
          <p className="App-unverified">Reach out to your Rogers Covid Project support contact.</p>
          <p className="App-unverified">Your account must be manually approved prior to accessing data.</p>
        </header>
      </div>
    );

    const Chart = ({label, url}) => (
      <div>
        <p>{label}</p>
        <img src={url} alt="logo" className="App-chart"/>
      </div>
    )

    const ActiveCharts = ({label, charts}) => {
      if(charts) {
        return (
          <div>
            {charts.cough ? <Chart label={"Cough: " + label} url={this.state.coughChartUrl} /> : <div></div>} 
            {charts.heart_rate ? <Chart label={"Heart Rate: " + label} url={this.state.heartRateChartUrl} /> : <div></div>} 
            {charts.physical_activity ? <Chart label={"Physical Activity: " + label} url={this.state.physicalActivityChartUrl} /> : <div></div>} 
            {charts.temperature ? <Chart label={"Temperature: " + label} url={this.state.temperatureChartUrl} /> : <div></div>} 
          </div>
        );
      } else {
        return <div></div>
      }
    }

    const VerifiedApp = () => (
      <div>
        <header className="App-header">
          <div className="App-filter">
            <div className="App-filterInfo">
              <p className="App-verified">Select a chart.</p>
              <p className="App-verified">Filter by patient id and date.</p>
              <p className="App-verified">Chart types may include Heart Rate, Cough Count, Physical Activity, and Temperature.</p>

              <div className="App-select">
                <Select
                  className="basic-single"
                  classNamePrefix="select"
                  isDisabled={false}
                  isLoading={this.state.loadingCharts}
                  isClearable={true}
                  isRtl={false}
                  isSearchable={true}
                  name="patientId"
                  options={this.state.patientIdOptions}
                  value={{label: this.state.selectedCharts}}
                  onChange={this.handleSelectedChartsChange.bind(this)}
                />
              </div>
            </div>

            <div className="App-filterInfo">
                <p className="App-verified">Select a raw HDF source.</p>
                <p className="App-verified">Raw data may number in GBs and require minutes/hours to download.</p>
                <div className="App-select">
                  <Select
                    className="basic-single"
                    classNamePrefix="select"
                    isDisabled={false}
                    isLoading={this.state.loadingCharts}
                    isClearable={true}
                    isRtl={false}
                    isSearchable={true}
                    name="rawH5"
                    options={this.state.rawOptions}
                    value={{label: this.state.selectedRaw}}
                    onChange={this.handleSelectedRawChange.bind(this)}
                  />

                  <button className="select__control" onClick={this.handleDownloadRaw.bind(this)}>
                    Download Raw
                  </button>
              </div>
            </div>

          </div>

          <ActiveCharts label={this.state.selectedCharts} charts={this.state.possibleCharts.get(this.state.selectedCharts)} />
        </header>
     </div>
    );


    return (
      <div className="App">
        {this.state.verified ? <VerifiedApp /> : <UnverifiedApp />}
      </div>
    );
  }
}

export default withAuthenticator(App, true);
