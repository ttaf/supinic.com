module.exports = (function () {
	"use strict";
	
	const Suggestion = require("../../modules/data/suggestion.js");

	const Express = require("express");
	const Router = Express.Router();

	const columnList = ["Author", "Text", "Status", "Priority", "Update", "ID"];
	const prettifyData = (data) => data.map(i => {
		const text = (i.text) ? sb.Utils.escapeHTML(i.text) : "N/A";
		const trimmedText = sb.Utils.wrapString(text, 200);
		const update = (i.lastUpdate) ? new sb.Date(i.lastUpdate) : null;

		return {
			Author: i.userName,
			Text: (i.text.length > 200)
				? `<div title="${text}">${trimmedText}</div>`
				: text,
			Status: i.status ?? "(pending)",
			Priority: {
				value: (i.priority === 255) ? "(pending)" : (i.priority ?? "N/A"),
				dataOrder: (i.priority === null) ? 255 : i.priority
			},
			Update: {
				value: (update) ? sb.Utils.timeDelta(update) : "N/A",
				dataOrder: update ?? 0
			},
			ID: `<a href="/data/suggestion/${i.ID}">${i.ID}</a>`
		};
	});

	Router.get("/list", async (req, res) => {
		const { userName } = req.query;

		let response;
		if (userName) {
			response = await sb.Got("Supinic", {
				url: "data/suggestion/list",
				searchParams: "userName=" + encodeURIComponent(userName)
			}).json();
		}
		else {
			response = await sb.Got("Supinic", "data/suggestion/list").json();
		}

		const printData = prettifyData(response.data);

		res.render("generic-list-table", {
			data: printData,
			head: columnList,
			pageLength: 25,
			sortColumn: 5,
			sortDirection: "desc",
			specificFiltering: true,
			deferRender: true
		});
	});

	Router.get("/list/pretty", async (req, res) => {
		const { data } = await sb.Got("Supinic", "data/suggestion/meta").json();
		const objectColumns = JSON.stringify(data.columns.map(i => ({ data: i })));

		res.render("generic-list-table-defer", {
			head: data.columns,
			script: `
				$(document).ready(async () => {
					const response = await fetch("https://supinic.com/api/data/suggestion/list/pretty");
					const json = await response.json();					
					
					const table = $("#table").DataTable({
						ajax: {
							url: "https://supinic.com/api/data/suggestion/list/pretty",
							type: "GET",
							dataType: "json",
							dataSrc: (response) => response.data
						},
						columns: ${objectColumns},
						pageLength: 25,
						order: [0, "asc"],
				        processing: true,
				        serverSide: true,
						deferRender: true,
						deferLoading: ${data.count}
					});
				});
			`
		});
	});

	Router.get("/stats", async (req, res) => {
		const auth = await sb.WebUtils.getUserLevel(req, res);
		if (auth.error) {
			return res.status(401).render("error", {
				error: "401 Unauthorized",
				message: "Your session timed out, please log in again"
			});
		}
		else if (!sb.WebUtils.compareLevels(auth.level, "login")) {
			return res.status(401).render("error", {
				error: "401 Unauthorized",
				message: "You must be logged in before viewing your suggestion statistics"
			});
		}

		const {Count: totalCount} = (await Suggestion.selectSingleCustom(rs => rs
			.select("COUNT(*) AS Count")
		));

		const rawData = await Suggestion.selectMultipleCustom(rs => rs
			.select("COUNT(*) AS Amount")
			.where("User_Alias = %n", auth.userID)
			.groupBy("Status")
		);

		const userCount = rawData.reduce((acc, cur) => acc += cur.Amount, 0);
		const data = rawData.map(i => ({
			Status: i.Status ?? "Pending review",
			Count: i.Amount,
			"% total": sb.Utils.round(i.Amount / totalCount * 100, 2),
			"% yours": sb.Utils.round(i.Amount / userCount * 100, 2)
		}));

		res.render("generic-list-table", {
			data: data,
			head: ["Status", "Count", "% total", "% yours"],
			pageLength: 25
		});
	});

	Router.get("/:id", async (req, res) => {
		const suggestionID = Number(req.params.id);
		if (!sb.Utils.isValidInteger(suggestionID)) {
			return res.status(404).render("error", {
				error: "404 Not found",
				message: "Invalid suggestion ID"
			});
		}

		const { data } = await sb.Got("Supinic", `data/suggestion/${suggestionID}`).json();
		if (!data) {
			return res.status(404).render("error", {
				error: "404 Not found",
				message: "Suggestion does not exist"
			});
		}

		let priorityString = String(data.priority);
		if (data.category === "Void") {
			priorityString = "N/A";
		}
		else if (!data.category || data.priority === 255 || data.priority === null) {
			priorityString = "(pending review)";
		}

		const renderData = {
			ID: data.ID,
			"Created by": data.username,
			"Created on": new sb.Date(data.date).format("Y-m-d H:i:s"),
			Category: data.category ?? "(pending review)",
			Status: data.status ?? "(pending review)",
			Priority: priorityString,
			Text: (data.text)
				? sb.Utils.escapeHTML(data.text)
				: "N/A",
			Notes: data.notes ?? "N/A",
			"Last update": (data.lastUpdate)
				? new sb.Date(data.lastUpdate).format("Y-m-d H:i:s")
				: "N/A"
		};

		if (data.githubLink) {
			renderData["GitHub reference"] = `<a target="_blank" href="//${data.githubLink}">Link</a>`;
		}

		res.render("generic-detail-table", {
			data: renderData,
			openGraphDefinition: [
				{
					property: "title",
					content: `Suggestion ID ${data.ID} from ${data.username} (${data.status ?? "pending"})`
				},
				{
					property: "description",
					content: (data.text)
						? sb.Utils.wrapString(data.text, 300)
						: "(no description available)"
				},
				{
					property: "url",
					content: `https://supinic.com/data/suggestion/${data.ID}`
				}
			]
		});
	});

	return Router;
})();